<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Concerns\StreamsExports;
use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Models\Product;
use App\Models\StockMovement;
use App\Services\StockMovementService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use PhpOffice\PhpSpreadsheet\Spreadsheet;

/**
 * The dedicated stock-action endpoints: Stock Received, Write-off, and Stock
 * Count. Each routes the change through StockMovementService (the single
 * authority that locks the product, hard-blocks negatives, appends the
 * immutable stock_movements row, bumps the daily card, and persists the new
 * quantity) and writes a human-readable audit row so the trail names the
 * product and says what happened in plain English.
 *
 * Stock Movements list + export give the auditor the complete ledger view.
 */
class StockMovementController extends Controller
{
    use StreamsExports;

    /** Human labels for the movement type column — keeps the export readable. */
    private const TYPE_LABELS = [
        'received' => 'Stock received',
        'sale' => 'Sale',
        'void' => 'Sale voided',
        'write_off' => 'Stock written off',
        'count' => 'Stock count',
        'transfer' => 'Stock transfer',
    ];

    public function __construct(
        private readonly StockMovementService $movements,
    ) {
    }

    public function received(Request $request, Product $product)
    {
        $data = $request->validate([
            'quantity' => ['required', 'numeric', 'gt:0'],
            'reason' => ['nullable', 'string', 'max:120'],
            'note' => ['nullable', 'string', 'max:255'],
        ]);

        $user = $request->user();
        $qty = (string) $data['quantity'];

        $movement = DB::transaction(function () use ($user, $product, $data, $qty) {
            $m = $this->movements->record(
                $user->tenant_id, $product->id, 'received', $qty, $user->id,
                ['reason' => $data['reason'] ?? null, 'note' => $data['note'] ?? null]
            );

            DB::afterCommit(fn () => AuditLog::record(
                'stock.received', $product,
                ['quantity' => $qty, 'reason' => $data['reason'] ?? null, 'before' => (string) $m->quantity_before, 'after' => (string) $m->quantity_after],
                $product->name,
                "Received {$qty} into {$product->name}"
            ));

            return $m;
        });

        return response()->json(['data' => $movement->load(['product', 'user'])], 201);
    }

    public function writeOff(Request $request, Product $product)
    {
        $data = $request->validate([
            'quantity' => ['required', 'numeric', 'gt:0'],
            'reason' => ['nullable', 'string', 'max:120'],
            'note' => ['nullable', 'string', 'max:255'],
        ]);

        $user = $request->user();
        $qty = (string) $data['quantity'];

        $movement = DB::transaction(function () use ($user, $product, $data, $qty) {
            $m = $this->movements->record(
                $user->tenant_id, $product->id, 'write_off', bcmul($qty, '-1', 4), $user->id,
                ['reason' => $data['reason'] ?? null, 'note' => $data['note'] ?? null]
            );

            DB::afterCommit(fn () => AuditLog::record(
                'stock.write_off', $product,
                ['quantity' => $qty, 'reason' => $data['reason'] ?? null, 'before' => (string) $m->quantity_before, 'after' => (string) $m->quantity_after],
                $product->name,
                "Wrote off {$qty} from {$product->name}"
            ));

            return $m;
        });

        return response()->json(['data' => $movement->load(['product', 'user'])], 201);
    }

    public function count(Request $request, Product $product)
    {
        $data = $request->validate([
            'counted' => ['required', 'numeric', 'min:0'],
            'reason' => ['nullable', 'string', 'max:120'],
            'note' => ['nullable', 'string', 'max:255'],
        ]);

        $user = $request->user();
        $counted = (string) $data['counted'];

        $movement = DB::transaction(function () use ($user, $product, $data, $counted) {
            $m = $this->movements->record(
                $user->tenant_id, $product->id, 'count', '0', $user->id,
                ['counted' => $counted, 'reason' => $data['reason'] ?? null, 'note' => $data['note'] ?? null]
            );

            DB::afterCommit(fn () => AuditLog::record(
                'stock.count', $product,
                ['counted' => $counted, 'reason' => $data['reason'] ?? null, 'before' => (string) $m->quantity_before, 'after' => (string) $m->quantity_after],
                $product->name,
                "Stock count for {$product->name}: {$counted} counted (was {$m->quantity_before})"
            ));

            return $m;
        });

        return response()->json(['data' => $movement->load(['product', 'user'])], 201);
    }

    /**
     * Record a break-bulk / repackage event (e.g. opening cartons into singles).
     * Stock is one base-unit number, so repackaging moves no stock — the cartons
     * and the singles they become are the same base units. The movement row (with
     * its unit/factor context) is the auditor-visible record that it happened.
     */
    public function transfer(Request $request, Product $product)
    {
        $data = $request->validate([
            'unit_id' => [
                'required', 'integer',
                function (string $attr, $value, $fail) use ($product, $request) {
                    if (! $product->saleUnits()->where('unit_id', $value)->exists()) {
                        $fail('The selected unit is not a configured sale unit for this product.');
                    }
                },
            ],
            'quantity' => ['required', 'numeric', 'gt:0'],
            'note' => ['nullable', 'string', 'max:255'],
        ]);

        $user = $request->user();
        $saleUnit = $product->saleUnits()->where('unit_id', $data['unit_id'])->first();
        $qty = (string) $data['quantity'];

        $movement = DB::transaction(function () use ($user, $product, $data, $saleUnit, $qty) {
            $m = $this->movements->record(
                $user->tenant_id, $product->id, 'transfer', '0', $user->id,
                [
                    'unit_id' => $saleUnit->unit_id,
                    'factor' => (string) $saleUnit->factor,
                    'note' => $data['note'] ?? null,
                ]
            );

            DB::afterCommit(fn () => AuditLog::record(
                'stock.transfer', $product,
                ['quantity' => $qty, 'unit' => $saleUnit->unit?->name, 'factor' => $saleUnit->factor],
                $product->name,
                "Repackaged {$qty} × {$saleUnit->unit?->name} of {$product->name}"
            ));

            return $m;
        });

        return response()->json(['data' => $movement->load(['product', 'user', 'unit'])], 201);
    }

    /** Paginated stock-movements ledger — filterable by type, product, and date. */
    public function index(Request $request)
    {
        $movements = StockMovement::query()
            ->with(['product', 'user', 'unit'])
            ->when($request->filled('type'), fn ($q) => $q->where('type', $request->string('type')))
            ->when($request->filled('product_id'), fn ($q) => $q->where('product_id', $request->integer('product_id')))
            ->when($request->filled('from'), fn ($q) => $q->whereDate('created_at', '>=', $request->string('from')))
            ->when($request->filled('to'), fn ($q) => $q->whereDate('created_at', '<=', $request->string('to')))
            ->when($request->filled('search'), function ($q) use ($request) {
                $term = $request->string('search');
                $q->whereHas('product', fn ($p) => $p->where('name', 'like', "%{$term}%"))
                    ->orWhere('reason', 'like', "%{$term}%")
                    ->orWhere('note', 'like', "%{$term}%");
            })
            ->latest('created_at')
            ->paginate($request->integer('per_page', 25))
            ->withQueryString()
            ->through(fn ($m) => array_merge($m->toArray(), [
                'type_label' => self::TYPE_LABELS[$m->type] ?? $m->type,
            ]));

        return response()->json($movements);
    }

    /** Stock movements export to .xlsx — honours the same filters (admin only). */
    public function export(Request $request)
    {
        $this->prepareExport();

        $spreadsheet = new Spreadsheet();
        $sheet = $spreadsheet->getActiveSheet();
        $headers = ['Date', 'Time', 'Type', 'Product', 'Before', 'Delta', 'After', 'Reason', 'Note', 'User'];
        $sheet->fromArray([$headers], null, 'A1');

        $row = 2;
        $widths = array_map('strlen', $headers);

        $movements = StockMovement::query()
            ->with(['product', 'user', 'unit'])
            ->when($request->filled('type'), fn ($q) => $q->where('type', $request->string('type')))
            ->when($request->filled('product_id'), fn ($q) => $q->where('product_id', $request->integer('product_id')))
            ->when($request->filled('from'), fn ($q) => $q->whereDate('created_at', '>=', $request->string('from')))
            ->when($request->filled('to'), fn ($q) => $q->whereDate('created_at', '<=', $request->string('to')))
            ->when($request->filled('search'), function ($q) use ($request) {
                $term = $request->string('search');
                $q->whereHas('product', fn ($p) => $p->where('name', 'like', "%{$term}%"))
                    ->orWhere('reason', 'like', "%{$term}%")
                    ->orWhere('note', 'like', "%{$term}%");
            })
            ->latest('created_at')
            ->cursor();

        foreach ($movements as $m) {
            $cells = [
                $m->created_at ? $m->created_at->format('Y-m-d') : '—',
                $m->created_at ? $m->created_at->format('H:i') : '—',
                self::TYPE_LABELS[$m->type] ?? $m->type,
                $m->product?->name ?? '—',
                (string) $m->quantity_before,
                (string) $m->delta,
                (string) $m->quantity_after,
                $m->reason ?? '—',
                $m->note ?? '—',
                $m->user?->name ?? 'System',
            ];
            $this->trackWidths($widths, $cells);
            $sheet->fromArray([$cells], null, "A{$row}");
            $row++;
        }

        $this->styleSheet($sheet, $headers, [], $widths);

        return $this->streamSpreadsheet($spreadsheet, $this->exportName('stock-movements', null, null));
    }
}