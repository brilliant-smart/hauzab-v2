<?php

namespace App\Http\Controllers\Api;

use App\Enums\OrderStatus;
use App\Enums\PaymentMethod;
use App\Enums\Role;
use App\Http\Controllers\Controller;
use App\Http\Resources\OrderResource;
use App\Models\Order;
use App\Models\Product;
use Illuminate\Database\QueryException;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

class OrderController extends Controller
{
    public function index(Request $request)
    {
        $user = $request->user();

        $orders = Order::query()
            ->with(['items', 'payments', 'customer', 'user'])
            ->when($request->filled('search'), function ($q) use ($request) {
                $term = $request->string('search');
                $q->where(fn ($inner) => $inner
                    ->where('number', 'like', "%{$term}%")
                    ->orWhere('customer_name', 'like', "%{$term}%"));
            })
            ->when($request->filled('status'), fn ($q) => $q->where('status', $request->string('status')))
            // Front-line staff only see their own sales; supervisors and
            // admins see the whole branch's register activity.
            ->when(! $user->isAtLeast(Role::Supervisor), fn ($q) => $q->where('user_id', $user->id))
            ->latest()
            ->paginate($request->integer('per_page', 25))
            ->withQueryString();

        return OrderResource::collection($orders)->response();
    }

    public function store(Request $request)
    {
        $data = $this->validated($request);

        // Idempotent checkout: a retried POST carries the same client UUID.
        // The Phase 3 sync engine relies on this to avoid double-posting.
        $existing = Order::where('uuid', $data['uuid'])->first();
        if ($existing) {
            return (new OrderResource($existing->load(['items', 'payments', 'customer', 'user', 'tenant', 'branch'])))
                ->response()
                ->setStatusCode(200);
        }

        $order = $this->createOrder($request, $data);

        return (new OrderResource($order->load(['items', 'payments', 'customer', 'user', 'tenant', 'branch'])))
            ->response()
            ->setStatusCode(201);
    }

    public function show(Order $order)
    {
        return new OrderResource($order->load(['items', 'payments', 'customer', 'user', 'tenant', 'branch']));
    }

    public function void(Request $request, Order $order)
    {
        if ($order->status !== OrderStatus::Completed) {
            return response()->json(['message' => 'Only completed orders can be voided'], 422);
        }

        DB::transaction(function () use ($order) {
            // Restore stock for every line still tied to a live product.
            foreach ($order->items as $item) {
                if ($item->product_id) {
                    Product::where('id', $item->product_id)
                        ->increment('quantity', $item->quantity);
                }
            }

            $order->update(['status' => OrderStatus::Voided->value]);
        });

        return new OrderResource($order->load(['items', 'payments', 'customer', 'user', 'tenant', 'branch']));
    }

    private function createOrder(Request $request, array $data): Order
    {
        $user = $request->user();

        // Two checkouts can grab the same INV-00000N between count() and create().
        // The unique(tenant_id, number) index rejects the loser; retry the whole
        // transaction so the count is recomputed and stock locks re-acquired.
        for ($attempt = 0; $attempt < 5; $attempt++) {
            try {
                return $this->persistOrder($user, $data);
            } catch (QueryException $e) {
                if ($e->errorInfo[1] ?? null !== 1062) {
                    throw $e;
                }
            }
        }

        abort(500, 'Unable to allocate an order number.');
    }

    private function persistOrder($user, array $data): Order
    {
        return DB::transaction(function () use ($user, $data) {
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

            $number = $this->nextNumber($user->tenant_id);

            $order = Order::create([
                'tenant_id' => $user->tenant_id,
                'branch_id' => $user->branch_id,
                'device_id' => null,
                'user_id' => $user->id,
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

    private function validated(Request $request): array
    {
        return $request->validate([
            'uuid' => ['required', 'uuid'],
            'items' => ['required', 'array', 'min:1'],
            'items.*.product_id' => ['required', 'integer', 'exists:products,id'],
            'items.*.quantity' => ['required', 'numeric', 'min:0.0001'],
            'items.*.unit_price' => ['required', 'numeric', 'min:0'],
            'discount' => ['nullable', 'numeric', 'min:0'],
            'payments' => ['required', 'array', 'min:1'],
            'payments.*.method' => ['required', 'string', Rule::in(array_column(PaymentMethod::cases(), 'value'))],
            'payments.*.amount' => ['required', 'numeric', 'min:0'],
            'customer_id' => ['nullable', 'integer', 'exists:customers,id'],
            'customer_name' => ['nullable', 'string', 'max:191'],
            'note' => ['nullable', 'string', 'max:191'],
        ]);
    }
}