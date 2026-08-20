<?php

namespace App\Http\Controllers\Api;

use App\Enums\OrderStatus;
use App\Enums\Role;
use App\Http\Controllers\Concerns\StreamsExports;
use App\Http\Controllers\Controller;
use App\Http\Resources\OrderResource;
use App\Models\Order;
use App\Models\ProductCard;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Pagination\LengthAwarePaginator;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use PhpOffice\PhpSpreadsheet\Spreadsheet;

class ReportController extends Controller
{
    use StreamsExports;
    /** Sales Report — order-level list with footer sums. */
    public function sales(Request $request)
    {
        [$from, $to] = $this->range($request);
        $user = $request->user();

        $statuses = [OrderStatus::Completed->value, OrderStatus::Credit->value];

        $orders = Order::query()
            ->with(['items', 'payments', 'user', 'customer'])
            ->where('tenant_id', $user->tenant_id)
            ->whereIn('status', $statuses)
            ->when($from, fn ($q) => $q->where('created_at', '>=', $from))
            ->when($to, fn ($q) => $q->where('created_at', '<=', $to))
            ->when(! $user->isAtLeast(Role::Supervisor), fn ($q) => $q->where('user_id', $user->id))
            ->latest()
            ->paginate($request->integer('per_page', 25))
            ->withQueryString();

        $sums = Order::where('tenant_id', $user->tenant_id)
            ->whereIn('status', $statuses)
            ->when($from, fn ($q) => $q->where('created_at', '>=', $from))
            ->when($to, fn ($q) => $q->where('created_at', '<=', $to))
            ->when(! $user->isAtLeast(Role::Supervisor), fn ($q) => $q->where('user_id', $user->id))
            ->selectRaw('COUNT(*) as count, COALESCE(SUM(total),0) as total, COALESCE(SUM(amount_paid),0) as amount_paid')
            ->first();

        return OrderResource::collection($orders)->additional([
            'sums' => [
                'count' => (int) $sums->count,
                'total' => (string) $sums->total,
                'amount_paid' => (string) $sums->amount_paid,
            ],
        ])->response();
    }

    /** Sales Audit — per-product daily stock-ledger movement. */
    public function salesAudit(Request $request)
    {
        [$from, $to] = $this->range($request);
        $user = $request->user();
        [$fromDay, $toDay] = $this->rangeDays($from, $to);
        $tenantId = $user->tenant_id;

        // Join-free count over the (tenant_id, date) index — the joined count
        // Laravel's paginate() would run is ~3s on the 800k-row ledger because
        // the user left-join can't ride the index.
        $perPage = max(1, $request->integer('per_page', 100));
        $page = max(1, $request->integer('page', 1));
        $total = ProductCard::where('tenant_id', $tenantId)
            ->when($fromDay, fn ($q) => $q->where('date', '>=', $fromDay))
            ->when($toDay, fn ($q) => $q->where('date', '<=', $toDay))
            ->count();

        $items = ProductCard::query()
            ->join('products', 'products.id', '=', 'product_cards.product_id')
            ->leftJoin('users', 'users.id', '=', 'product_cards.user_id')
            ->where('product_cards.tenant_id', $tenantId)
            ->when($fromDay, fn ($q) => $q->where('product_cards.date', '>=', $fromDay))
            ->when($toDay, fn ($q) => $q->where('product_cards.date', '<=', $toDay))
            ->orderByDesc('product_cards.date')
            ->orderByDesc('product_cards.id')
            ->select([
                'product_cards.id', 'product_cards.date', 'product_cards.opening',
                'product_cards.added', 'product_cards.reversed', 'product_cards.sold',
                'product_cards.cost_price', 'product_cards.selling_price',
                'products.name as product_name', 'products.size as product_size',
                'products.expire_date', 'users.name as user_name',
            ])
            ->forPage($page, $perPage)
            ->get()
            ->map(function ($r) {
                $amount = bcmul((string) $r->sold, (string) ($r->selling_price ?? 0), 4);
                $closing = bcsub(bcadd((string) $r->opening, (string) $r->added, 4), (string) $r->sold, 4);

                return [
                    'id' => $r->id,
                    'date' => $r->date?->toDateString(),
                    'product_name' => $r->product_name,
                    'product_size' => $r->product_size,
                    'opening' => (string) $r->opening,
                    'added' => (string) $r->added,
                    'reversed' => (string) $r->reversed,
                    'sold' => (string) $r->sold,
                    'cost_price' => (string) ($r->cost_price ?? 0),
                    'selling_price' => (string) ($r->selling_price ?? 0),
                    'amount' => $amount,
                    'closing' => $closing,
                    'expire_date' => optional($r->expire_date)->toDateString(),
                    'user_name' => $r->user_name,
                ];
            });

        $rows = new LengthAwarePaginator(
            $items, $total, $perPage, $page, ['path' => $request->url(), 'query' => $request->query()]
        );

        // Full-range totals for the footer — computed in one aggregate pass so
        // the page total is correct without loading every audit row.
        $sums = ProductCard::where('tenant_id', $tenantId)
            ->when($fromDay, fn ($q) => $q->where('date', '>=', $fromDay))
            ->when($toDay, fn ($q) => $q->where('date', '<=', $toDay))
            ->selectRaw('COUNT(*) as count, COALESCE(SUM(sold),0) as sold, COALESCE(SUM(sold * selling_price),0) as amount')
            ->first();

        $payload = $rows->toArray();
        $payload['sums'] = [
            'count' => (int) $sums->count,
            'sold' => (string) $sums->sold,
            'amount' => (string) $sums->amount,
        ];

        return response()->json($payload);
    }

    /** Sales Report export to .xlsx — one row per order (admin only). */
    public function salesExport(Request $request)
    {
        $this->prepareExport();
        [$from, $to] = $this->range($request);
        $user = $request->user();
        $statuses = [OrderStatus::Completed->value, OrderStatus::Credit->value];

        $spreadsheet = new Spreadsheet();
        $sheet = $spreadsheet->getActiveSheet();
        $headers = ['Order ID', 'Date', 'Time', 'Cashier', 'Customer', 'Status', 'Items', 'Total', 'Amount Paid'];
        $sheet->fromArray([$headers], null, 'A1');

        $row = 2;
        $widths = array_map('strlen', $headers);
        Order::query()
            ->with(['items', 'user', 'customer'])
            ->where('tenant_id', $user->tenant_id)
            ->whereIn('status', $statuses)
            ->when($from, fn ($q) => $q->where('created_at', '>=', $from))
            ->when($to, fn ($q) => $q->where('created_at', '<=', $to))
            ->when(! $user->isAtLeast(Role::Supervisor), fn ($q) => $q->where('user_id', $user->id))
            ->chunkById(1000, function ($orders) use ($sheet, &$row, &$widths) {
                foreach ($orders as $o) {
                    $cells = [
                        $o->legacy_number ?: $o->number,
                        $o->created_at?->format('Y-m-d'),
                        $o->created_at?->format('H:i'),
                        $o->user?->name,
                        $o->customer?->name ?: $o->customer_name,
                        $o->status->label(),
                        count($o->items),
                        (float) $o->total,
                        (float) $o->amount_paid,
                    ];
                    $this->trackWidths($widths, $cells);
                    $sheet->fromArray([$cells], null, "A{$row}");
                    $row++;
                }
            });

        $this->styleSheet($sheet, $headers, [8, 9], $widths); // Total, Amount Paid

        return $this->streamSpreadsheet($spreadsheet, $this->exportName('sales-report', $from, $to));
    }

    /** Sales History export to .xlsx — one row per line item, with order context (admin only). */
    public function salesHistoryExport(Request $request)
    {
        $this->prepareExport();
        [$from, $to] = $this->range($request);
        $user = $request->user();

        $spreadsheet = new Spreadsheet();
        $sheet = $spreadsheet->getActiveSheet();
        $headers = ['Order ID', 'Date', 'Time', 'Cashier', 'Customer', 'Status', 'Product', 'Quantity', 'Unit Price', 'Line Total'];
        $sheet->fromArray([$headers], null, 'A1');

        $row = 2;
        $widths = array_map('strlen', $headers);
        Order::query()
            ->with(['items', 'user', 'customer'])
            ->where('tenant_id', $user->tenant_id)
            ->when($request->filled('status'), fn ($q) => $q->where('status', $request->string('status')))
            ->when($from, fn ($q) => $q->where('created_at', '>=', $from))
            ->when($to, fn ($q) => $q->where('created_at', '<=', $to))
            ->when(! $user->isAtLeast(Role::Supervisor), fn ($q) => $q->where('user_id', $user->id))
            ->chunkById(1000, function ($orders) use ($sheet, &$row, &$widths) {
                foreach ($orders as $o) {
                    $date = $o->created_at?->format('Y-m-d');
                    $time = $o->created_at?->format('H:i');
                    $cashier = $o->user?->name;
                    $customer = $o->customer?->name ?: $o->customer_name;
                    $status = $o->status->label();
                    $orderId = $o->legacy_number ?: $o->number;
                    foreach ($o->items as $item) {
                        $cells = [
                            $orderId, $date, $time, $cashier, $customer, $status,
                            $item->product_name,
                            (float) $item->quantity,
                            (float) $item->unit_price,
                            (float) $item->line_total,
                        ];
                        $this->trackWidths($widths, $cells);
                        $sheet->fromArray([$cells], null, "A{$row}");
                        $row++;
                    }
                }
            });

        $this->styleSheet($sheet, $headers, [9, 10], $widths); // Unit Price, Line Total

        return $this->streamSpreadsheet($spreadsheet, $this->exportName('sales-history', $from, $to));
    }

    /** Sales Audit export to .xlsx (admin only). */
    public function salesAuditExport(Request $request)
    {
        $this->prepareExport();
        [$from, $to] = $this->range($request);
        $user = $request->user();
        [$fromDay, $toDay] = $this->rangeDays($from, $to);

        $spreadsheet = new Spreadsheet();
        $sheet = $spreadsheet->getActiveSheet();
        $headers = ['Date', 'Product Name', 'Size', 'Opening', 'Added', 'Cost Price', 'Selling Price', 'Qty Sold', 'Amount', 'Closing', 'Expire Date', 'Staff'];
        $sheet->fromArray([$headers], null, 'A1');

        $row = 2;
        $widths = array_map('strlen', $headers);
        // cursor() runs a single index-ordered query (riding the (tenant_id,
        // date) index) and streams rows from PDO one at a time — one query, no
        // offset re-scan, O(1) DB-side memory — instead of chunk()'s N
        // re-scans or chunkById's PK scatter-scan over the 800k-row ledger.
        $audit = ProductCard::query()
            ->join('products', 'products.id', '=', 'product_cards.product_id')
            ->leftJoin('users', 'users.id', '=', 'product_cards.user_id')
            ->where('product_cards.tenant_id', $user->tenant_id)
            ->when($fromDay, fn ($q) => $q->where('product_cards.date', '>=', $fromDay))
            ->when($toDay, fn ($q) => $q->where('product_cards.date', '<=', $toDay))
            ->orderBy('product_cards.date')
            ->orderBy('product_cards.id')
            ->select([
                'product_cards.date', 'product_cards.opening', 'product_cards.added',
                'product_cards.sold', 'product_cards.cost_price', 'product_cards.selling_price',
                'products.name as product_name', 'products.size as product_size',
                'products.expire_date', 'users.name as user_name',
            ])
            ->cursor();

        foreach ($audit as $r) {
            $cells = [
                $r->date?->toDateString(),
                $r->product_name,
                $r->product_size,
                (float) $r->opening,
                (float) $r->added,
                (float) $r->cost_price,
                (float) $r->selling_price,
                (float) $r->sold,
                (float) bcmul((string) $r->sold, (string) ($r->selling_price ?? 0), 4),
                (float) bcsub(bcadd((string) $r->opening, (string) $r->added, 4), (string) $r->sold, 4),
                optional($r->expire_date)->toDateString(),
                $r->user_name,
            ];
            $this->trackWidths($widths, $cells);
            $sheet->fromArray([$cells], null, "A{$row}");
            $row++;
        }

        $this->styleSheet($sheet, $headers, [6, 7, 9], $widths); // Cost Price, Selling Price, Amount

        return $this->streamSpreadsheet($spreadsheet, $this->exportName('sales-audit', $from, $to));
    }

    /** Staff Sales — sales grouped by staff member (admin only). */
    public function staffSales(Request $request)
    {
        [$from, $to] = $this->range($request);

        return response()->json(['data' => $this->staffSalesRows($request->user(), $from, $to)]);
    }

    /** Staff Sales export to .xlsx — one row per staff member (admin only). */
    public function staffSalesExport(Request $request)
    {
        $this->prepareExport();
        [$from, $to] = $this->range($request);
        $rows = $this->staffSalesRows($request->user(), $from, $to);

        $spreadsheet = new Spreadsheet();
        $sheet = $spreadsheet->getActiveSheet();
        $headers = ['Name', 'Sales', 'Amount'];
        $sheet->fromArray([$headers], null, 'A1');

        $row = 2;
        $widths = array_map('strlen', $headers);
        foreach ($rows as $r) {
            $cells = [
                $r->user_name,
                (int) $r->sales_count,
                (float) $r->total,
            ];
            $this->trackWidths($widths, $cells);
            $sheet->fromArray([$cells], null, "A{$row}");
            $row++;
        }

        $this->styleSheet($sheet, $headers, [3], $widths); // Amount

        return $this->streamSpreadsheet($spreadsheet, $this->exportName('staff-sales', $from, $to));
    }

    /**
     * Per-staff sales totals for the active tenant over a range, ordered by
     * amount desc. Shared by the JSON view and the xlsx export so they agree.
     */
    private function staffSalesRows(User $user, ?Carbon $from, ?Carbon $to)
    {
        $statuses = [OrderStatus::Completed->value, OrderStatus::Credit->value];
        $orders = (new Order)->getTable();
        $users = (new User)->getTable();
        // selectRaw is emitted verbatim, so the table prefix (only set in the
        // test suite) must be applied by hand; the join/where/groupBy clauses
        // are qualified by the grammar already.
        $prefix = DB::getTablePrefix();

        return Order::query()
            ->join($users, "$users.id", '=', "$orders.user_id")
            ->where("$orders.tenant_id", $user->tenant_id)
            ->whereIn("$orders.status", $statuses)
            ->when($from, fn ($q) => $q->where("$orders.created_at", '>=', $from))
            ->when($to, fn ($q) => $q->where("$orders.created_at", '<=', $to))
            ->selectRaw("{$prefix}{$users}.id as user_id, {$prefix}{$users}.name as user_name, COUNT(*) as sales_count, COALESCE(SUM({$prefix}{$orders}.amount_paid),0) as total")
            ->groupBy("$users.id", "$users.name")
            ->orderByDesc('total')
            ->get();
    }

    /**
     * Resolve the from/to range as start/end-of-day Carbons. Either bound may be
     * null (an absent/empty param), which means "open" on that side — used by
     * the "All Time" preset, which sends no range. Queries guard each bound with
     * ->when() so null means no filter (and the tenant+date index still applies).
     */
    private function range(Request $request): array
    {
        $tz = config('app.timezone');

        $from = $request->filled('from')
            ? Carbon::parse($request->string('from'), $tz)->startOfDay()
            : null;
        $to = $request->filled('to')
            ? Carbon::parse($request->string('to'), $tz)->endOfDay()
            : null;

        return [$from, $to];
    }

    /**
     * Date-only bounds (for the product_cards.date DATE column) derived from the
     * datetime range. Comparing a DATE column against date strings lets MySQL use
     * the (tenant_id, date) index; whereDate() wraps the column in DATE() and
     * forces a full scan over the 800k-row ledger.
     */
    private function rangeDays(?Carbon $from, ?Carbon $to): array
    {
        return [
            $from?->toDateString(),
            $to?->toDateString(),
        ];
    }
}