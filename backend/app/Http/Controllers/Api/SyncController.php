<?php

namespace App\Http\Controllers\Api;

use App\Enums\OrderStatus;
use App\Http\Controllers\Controller;
use App\Http\Resources\OrderResource;
use App\Models\AuditLog;
use App\Models\Order;
use App\Models\Product;
use App\Services\OrderPersistence;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * Cloud receive side. The campus POSTs an OrderResource snapshot per sale and
 * a void marker per void. Both are idempotent on uuid, so a retried push never
 * double-charges stock. The cloud assigns its own INV number and deducts from
 * its own stock — campus and cloud sequences are independent; reporting joins
 * on uuid, not number.
 */
class SyncController extends Controller
{
    public function __construct(
        private readonly OrderPersistence $persistence,
    ) {
    }

    public function storeOrder(Request $request)
    {
        $payload = $request->validate([
            'uuid' => ['required', 'uuid'],
            'items' => ['required', 'array', 'min:1'],
            'items.*.product_id' => ['required', 'integer'],
            'items.*.quantity' => ['required', 'numeric', 'min:0.0001'],
            'items.*.unit_price' => ['required', 'numeric', 'min:0'],
            'discount' => ['nullable', 'numeric', 'min:0'],
            'payments' => ['required', 'array', 'min:1'],
            'payments.*.method' => ['required'],
            'payments.*.amount' => ['required', 'numeric', 'min:0'],
            'customer_id' => ['nullable', 'integer'],
            'customer_name' => ['nullable', 'string', 'max:191'],
            'note' => ['nullable', 'string', 'max:191'],
            'tenant_id' => ['nullable', 'integer'],
            'branch_id' => ['nullable', 'integer'],
            'user_id' => ['nullable', 'integer'],
            'device_id' => ['nullable', 'integer'],
            // Nested tenant/branch/user objects from the OrderResource are
            // accepted but the flat ids below take precedence when present.
            'tenant.id' => ['nullable', 'integer'],
            'branch.id' => ['nullable', 'integer'],
            'user.id' => ['nullable', 'integer'],
        ]);

        $uuid = $payload['uuid'];

        // Idempotent: a retried push returns the original cloud order.
        $existing = Order::where('uuid', $uuid)->first();
        if ($existing) {
            AuditLog::record('sync.received', $existing, ['duplicate' => true]);
            return (new OrderResource($existing->load(['items', 'payments', 'customer', 'user', 'tenant', 'branch'])))
                ->response()
                ->setStatusCode(200);
        }

        // Normalize the payment method: the campus snapshot serializes the
        // enum as {value, label}; accept either that or a bare string.
        $payments = array_map(function (array $p) {
            $method = is_array($p['method']) ? ($p['method']['value'] ?? null) : $p['method'];

            return [
                'method' => $method,
                'amount' => $p['amount'],
            ];
        }, $payload['payments']);

        $data = [
            'uuid' => $uuid,
            'items' => $payload['items'],
            'discount' => $payload['discount'] ?? 0,
            'payments' => $payments,
            'customer_id' => $payload['customer_id'] ?? null,
            'customer_name' => $payload['customer_name'] ?? null,
            'note' => $payload['note'] ?? null,
        ];

        $order = $this->persistence->create(
            $data,
            $payload['tenant_id'] ?? $payload['tenant']['id'] ?? null,
            $payload['branch_id'] ?? $payload['branch']['id'] ?? null,
            $payload['user_id'] ?? $payload['user']['id'] ?? null,
            $payload['device_id'] ?? null,
        )->load(['items', 'payments', 'customer', 'user', 'tenant', 'branch']);

        AuditLog::record('sync.received', $order);

        return (new OrderResource($order))
            ->response()
            ->setStatusCode(201);
    }

    public function voidOrder(string $uuid)
    {
        $order = Order::where('uuid', $uuid)->first();

        // The order should arrive before its void (the campus drains in id
        // order). A missing order means the sale push hasn't landed yet —
        // 404 so the campus retries rather than silently dropping the void.
        if (! $order) {
            abort(404, 'Order not found for void.');
        }

        if ($order->status === OrderStatus::Voided) {
            AuditLog::record('sync.voided', $order, ['duplicate' => true]);
            return (new OrderResource($order->load(['items', 'payments', 'customer', 'user', 'tenant', 'branch'])))
                ->response();
        }

        if ($order->status !== OrderStatus::Completed) {
            abort(422, 'Only completed orders can be voided.');
        }

        DB::transaction(function () use ($order) {
            foreach ($order->items as $item) {
                if ($item->product_id) {
                    Product::where('id', $item->product_id)
                        ->increment('quantity', $item->quantity);
                }
            }

            $order->update(['status' => OrderStatus::Voided->value]);
        });

        AuditLog::record('sync.voided', $order);

        return (new OrderResource($order->load(['items', 'payments', 'customer', 'user', 'tenant', 'branch'])))
            ->response();
    }
}