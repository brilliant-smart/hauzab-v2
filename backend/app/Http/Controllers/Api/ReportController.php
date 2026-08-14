<?php

namespace App\Http\Controllers\Api;

use App\Enums\OrderStatus;
use App\Enums\Role;
use App\Http\Controllers\Controller;
use App\Http\Resources\OrderResource;
use App\Models\Order;
use App\Models\ProductCard;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use PhpOffice\PhpSpreadsheet\Spreadsheet;
use PhpOffice\PhpSpreadsheet\Writer\Xlsx;

class ReportController extends Controller
{
    /** Sales Report — order-level list with footer sums. */
    public function sales(Request $request)
    {
        [$from, $to] = $this->range($request);
        $user = $request->user();

        $statuses = [OrderStatus::Completed->value, OrderStatus::Credit->value];

        $orders = Order::query()
            ->with(['items', 'payments', 'user', 'customer'])
            ->whereIn('status', $statuses)
            ->whereDate('created_at', '>=', $from)
            ->whereDate('created_at', '<=', $to)
            ->when(! $user->isAtLeast(Role::Supervisor), fn ($q) => $q->where('user_id', $user->id))
            ->latest()
            ->paginate($request->integer('per_page', 25))
            ->withQueryString();

        $sums = Order::whereIn('status', $statuses)
            ->whereDate('created_at', '>=', $from)
            ->whereDate('created_at', '<=', $to)
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

        $rows = ProductCard::query()
            ->join('products', 'products.id', '=', 'product_cards.product_id')
            ->leftJoin('users', 'users.id', '=', 'product_cards.user_id')
            ->whereDate('product_cards.date', '>=', $from)
            ->whereDate('product_cards.date', '<=', $to)
            ->orderByDesc('product_cards.date')
            ->orderBy('products.name')
            ->select([
                'product_cards.id', 'product_cards.date', 'product_cards.opening',
                'product_cards.added', 'product_cards.reversed', 'product_cards.sold',
                'product_cards.cost_price', 'product_cards.selling_price',
                'products.name as product_name', 'products.size as product_size',
                'products.expire_date', 'users.name as user_name',
            ])
            ->paginate($request->integer('per_page', 100))
            ->through(function ($r) {
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

        return response()->json($rows);
    }

    /** Sales Audit export to .xlsx (admin only). */
    public function salesAuditExport(Request $request)
    {
        [$from, $to] = $this->range($request);

        $spreadsheet = new Spreadsheet();
        $sheet = $spreadsheet->getActiveSheet();
        $sheet->fromArray([
            ['Date', 'Product Name', 'Size', 'Opening', 'Added', 'Cost Price', 'Selling Price', 'Qty Sold', 'Amount', 'Closing', 'Expire Date', 'Staff'],
        ], null, 'A1');

        $row = 2;
        ProductCard::query()
            ->join('products', 'products.id', '=', 'product_cards.product_id')
            ->leftJoin('users', 'users.id', '=', 'product_cards.user_id')
            ->whereDate('product_cards.date', '>=', $from)
            ->whereDate('product_cards.date', '<=', $to)
            ->orderByDesc('product_cards.date')
            ->orderBy('products.name')
            ->select([
                'product_cards.date', 'product_cards.opening', 'product_cards.added',
                'product_cards.sold', 'product_cards.cost_price', 'product_cards.selling_price',
                'products.name as product_name', 'products.size as product_size',
                'products.expire_date', 'users.name as user_name',
            ])
            ->chunk(1000, function ($chunk) use ($sheet, &$row) {
                foreach ($chunk as $r) {
                    $sheet->fromArray([[
                        $r->date?->toDateString(),
                        $r->product_name,
                        $r->product_size,
                        (string) $r->opening,
                        (string) $r->added,
                        (string) $r->cost_price,
                        (string) $r->selling_price,
                        (string) $r->sold,
                        bcmul((string) $r->sold, (string) ($r->selling_price ?? 0), 4),
                        bcsub(bcadd((string) $r->opening, (string) $r->added, 4), (string) $r->sold, 4),
                        optional($r->expire_date)->toDateString(),
                        $r->user_name,
                    ]], null, "A{$row}");
                    $row++;
                }
            });

        $fileName = "sales-audit-{$from->toDateString()}-to-{$to->toDateString()}.xlsx";
        $temp = tempnam(sys_get_temp_dir(), 'audit') . '.xlsx';
        (new Xlsx($spreadsheet))->save($temp);

        return response()->download($temp, $fileName, [
            'Content-Type' => 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        ])->deleteFileAfterSend();
    }

    /** Staff Sales — sales grouped by staff member (admin only). */
    public function staffSales(Request $request)
    {
        [$from, $to] = $this->range($request);
        $statuses = [OrderStatus::Completed->value, OrderStatus::Credit->value];

        $rows = Order::query()
            ->join('users', 'users.id', '=', 'orders.user_id')
            ->whereIn('orders.status', $statuses)
            ->whereDate('orders.created_at', '>=', $from)
            ->whereDate('orders.created_at', '<=', $to)
            ->selectRaw('users.id as user_id, users.name as user_name, COUNT(*) as sales_count, COALESCE(SUM(orders.amount_paid),0) as total')
            ->groupBy('users.id', 'users.name')
            ->orderByDesc('total')
            ->get();

        return response()->json(['data' => $rows]);
    }

    /**
     * Resolve the from/to range, defaulting to today in the app timezone.
     */
    private function range(Request $request): array
    {
        $today = Carbon::today(config('app.timezone'));

        $from = $request->filled('from') ? Carbon::parse($request->string('from'), config('app.timezone'))->startOfDay() : (clone $today);
        $to = $request->filled('to') ? Carbon::parse($request->string('to'), config('app.timezone'))->endOfDay() : (clone $today)->endOfDay();

        return [$from, $to];
    }
}