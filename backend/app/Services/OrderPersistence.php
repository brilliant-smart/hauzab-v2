<?php

namespace App\Services;

use App\Enums\OrderStatus;
use App\Models\Order;
use App\Models\Product;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\DB;

/**
 * Single source of truth for writing an order's money + stock mutations.
 * Shared by the cashier-facing OrderController and the cloud SyncController
 * so both apply the exact same idempotent, cost-floored, stock-checked logic.
 */
class OrderPersistence
{
    public function __construct(
        private readonly StockMovementService $movements,
    ) {
    }

    /**
     * Create an order from already-validated data. Idempotent on uuid at the
     * caller's boundary (OrderController and SyncController both short-circuit
     * on an existing uuid); this method always allocates a fresh row.
     */
    public function create(array $data, int $tenantId, ?int $branchId, ?int $userId, ?int $deviceId): Order
    {
        // Two checkouts can grab the same daily sequence between read and insert.
        // The unique(tenant_id, number) index rejects the loser; retry the whole
        // transaction so the sequence is recomputed and stock locks re-acquired.
        for ($attempt = 0; $attempt < 5; $attempt++) {
            try {
                return $this->persist($data, $tenantId, $branchId, $userId, $deviceId);
            } catch (QueryException $e) {
                if (($e->errorInfo[1] ?? null) !== 1062) {
                    throw $e;
                }
            }
        }

        abort(500, 'Unable to allocate an order number.');
    }

    private function persist(array $data, int $tenantId, ?int $branchId, ?int $userId, ?int $deviceId): Order
    {
        return DB::transaction(function () use ($data, $tenantId, $branchId, $userId, $deviceId) {
            $productIds = collect($data['items'])->pluck('product_id')->unique()->all();
            $products = Product::query()
                ->with('saleUnits')
                ->lockForUpdate()
                ->whereIn('id', $productIds)
                ->get()
                ->keyBy('id');

            $subtotal = '0';
            $items = [];

            foreach ($data['items'] as $line) {
                $product = $products->get($line['product_id']);
                if (! $product) {
                    abort(422, "Product {$line['product_id']} not found.");
                }

                $qty = (string) $line['quantity'];
                if (bccomp($qty, '0') <= 0) {
                    abort(422, 'Quantity must be greater than zero.');
                }

                // Hard block selling expired stock at the register and on sync.
                if ($product->expire_date && $product->expire_date->isBefore(today())) {
                    abort(422, "Product {$product->name} has expired and cannot be sold.");
                }

                // A line may be rung up in a non-base sale unit (e.g. a carton).
                // The factor is server-authoritative: when a unit is given it must
                // be one of the product's configured sale units, and its factor
                // converts the sale-unit quantity into the base units that stock is
                // held and decremented in. Base unit = no unit_id, factor 1.
                $unitId = $line['unit_id'] ?? null;
                if ($unitId !== null) {
                    $saleUnit = $product->saleUnits->firstWhere('unit_id', $unitId);
                    if (! $saleUnit) {
                        abort(422, "Invalid sale unit for {$product->name}.");
                    }
                    $factor = (string) $saleUnit->factor;
                } else {
                    $saleUnit = null;
                    $factor = '1';
                    $unitId = null;
                }

                $baseQty = bcmul($qty, $factor, 4);

                if (bccomp($baseQty, (string) $product->quantity) > 0) {
                    abort(422, "Insufficient stock for {$product->name}.");
                }

                // Price is floored at the unit's cost (cost_price * factor for a
                // carton) so the register can never sell at a loss in any unit.
                $minUnitPrice = bcmul((string) $product->cost_price, $factor, 4);
                $unitPrice = max($line['unit_price'], (float) $minUnitPrice);
                $lineTotal = bcmul($qty, (string) $unitPrice, 4);

                $subtotal = bcadd($subtotal, $lineTotal, 4);

                $items[] = [
                    'product_id' => $product->id,
                    'product_name' => $product->name,
                    'barcode' => $product->barcode,
                    'quantity' => $qty,
                    'unit_id' => $unitId,
                    'factor' => $factor !== '1' ? $factor : null,
                    'unit_price' => $unitPrice,
                    'cost_price' => $product->cost_price,
                    'line_total' => $lineTotal,
                ];

                // Route the stock change through the single authority: it locks
                // the product, hard-blocks negatives, appends the stock_movements
                // row, bumps the daily card, and persists the new quantity. The
                // card opening captures pre-sale stock since the service mutates
                // only after bumping the card. The delta is in base units.
                $this->movements->record($tenantId, $product->id, 'sale', bcmul($baseQty, '-1', 4), $userId, [
                    'reference_type' => 'order',
                    'unit_id' => $unitId,
                    'factor' => $factor !== '1' ? $factor : null,
                ]);
            }

            $discount = (string) ($data['discount'] ?? 0);
            $total = bcsub($subtotal, $discount, 4);
            if (bccomp($total, '0') < 0) {
                abort(422, 'Discount cannot exceed the subtotal.');
            }

            $paid = '0';
            $payments = [];
            foreach ($data['payments'] as $p) {
                $amount = (string) $p['amount'];
                if (bccomp($amount, '0') <= 0) {
                    continue;
                }
                $paid = bcadd($paid, $amount, 4);
                $payments[] = [
                    'method' => $p['method'],
                    'amount' => $amount,
                ];
            }

            if (bccomp($paid, $total) < 0) {
                abort(422, 'Tender does not cover the total.');
            }

            $change = bcsub($paid, $total, 4);

            $number = $this->nextNumber($tenantId);

            $order = Order::create([
                'tenant_id' => $tenantId,
                'branch_id' => $branchId,
                'device_id' => $deviceId,
                'user_id' => $userId,
                'number' => $number,
                'uuid' => $data['uuid'],
                'subtotal' => $subtotal,
                'discount' => $discount,
                'total' => $total,
                'amount_paid' => $paid,
                'change' => $change,
                'status' => OrderStatus::Completed->value,
                'customer_id' => $data['customer_id'] ?? null,
                'customer_name' => $data['customer_name'] ?? null,
                'note' => $data['note'] ?? null,
            ]);

            $order->items()->createMany($items);
            $order->payments()->createMany($payments);

            return $order;
        });
    }

    /**
     * Per-tenant daily invoice number in the legacy date-based format: a 7-char
     * date prefix (YY + month abbreviation + day, e.g. 26AUG18) followed by a
     * 3-digit sequence that resets each day. Concurrent checkouts can compute
     * the same sequence; the unique index catches that and the caller retries
     * the whole transaction.
     */
    private function nextNumber(int $tenantId): string
    {
        $prefix = strtoupper(now()->format('yMd'));

        $last = Order::where('tenant_id', $tenantId)
            ->where('number', 'like', $prefix.'%')
            ->orderByDesc('id')
            ->value('number');

        $seq = $last ? ((int) substr($last, 7)) + 1 : 1;

        return $prefix . str_pad((string) $seq, 3, '0', STR_PAD_LEFT);
    }
}