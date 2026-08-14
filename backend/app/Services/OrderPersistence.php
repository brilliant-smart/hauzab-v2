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
    /**
     * Create an order from already-validated data. Idempotent on uuid at the
     * caller's boundary (OrderController and SyncController both short-circuit
     * on an existing uuid); this method always allocates a fresh row.
     */
    public function create(array $data, int $tenantId, ?int $branchId, ?int $userId, ?int $deviceId): Order
    {
        // Two checkouts can grab the same INV-00000N between count() and create().
        // The unique(tenant_id, number) index rejects the loser; retry the whole
        // transaction so the count is recomputed and stock locks re-acquired.
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
                if (bccomp($qty, (string) $product->quantity) > 0) {
                    abort(422, "Insufficient stock for {$product->name}.");
                }

                // Price is floored at cost so the register can never sell at a loss.
                $unitPrice = max($line['unit_price'], (float) $product->cost_price);
                $lineTotal = bcmul($qty, (string) $unitPrice, 4);

                $subtotal = bcadd($subtotal, $lineTotal, 4);

                $items[] = [
                    'product_id' => $product->id,
                    'product_name' => $product->name,
                    'barcode' => $product->barcode,
                    'quantity' => $qty,
                    'unit_price' => $unitPrice,
                    'cost_price' => $product->cost_price,
                    'line_total' => $lineTotal,
                ];

                $product->decrement('quantity', $qty);
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
     * Per-tenant sequential invoice number (INV-000001). Concurrent checkouts
     * can compute the same count; the unique index catches that and the caller
     * retries the whole transaction.
     */
    private function nextNumber(int $tenantId): string
    {
        $count = Order::where('tenant_id', $tenantId)->count();

        return 'INV-' . str_pad((string) ($count + 1), 6, '0', STR_PAD_LEFT);
    }
}