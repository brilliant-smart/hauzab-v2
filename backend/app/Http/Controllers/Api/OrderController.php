<?php

namespace App\Http\Controllers\Api;

use App\Enums\OrderStatus;
use App\Enums\PaymentMethod;
use App\Enums\Role;
use App\Http\Controllers\Controller;
use App\Http\Resources\OrderResource;
use App\Models\AuditLog;
use App\Models\Device;
use App\Models\Order;
use App\Models\Product;
use App\Models\SyncOutbox;
use App\Services\OrderPersistence;
use App\Services\StockLedger;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

class OrderController extends Controller
{
    public function __construct(
        private readonly OrderPersistence $persistence,
        private readonly StockLedger $ledger,
    ) {
    }

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
        $user = $request->user();

        // Idempotent checkout: a retried POST carries the same client UUID.
        // The sync engine relies on this to avoid double-posting.
        $existing = Order::where('uuid', $data['uuid'])->first();
        if ($existing) {
            return (new OrderResource($existing->load(['items', 'payments', 'customer', 'user', 'tenant', 'branch'])))
                ->response()
                ->setStatusCode(200);
        }

        $order = $this->persistence->create(
            $data,
            $user->tenant_id,
            $user->branch_id,
            $user->id,
            $data['device_id'] ?? null,
        )->load(['items', 'payments', 'customer', 'user', 'tenant', 'branch']);

        // Queue the cloud push and audit entry once the sale is durable.
        // The duplicate-uuid return above ensures this only runs for new orders.
        DB::afterCommit(function () use ($order) {
            SyncOutbox::create([
                'tenant_id' => $order->tenant_id,
                'kind' => 'order',
                'order_uuid' => $order->uuid,
                'payload' => (new OrderResource($order))->resolve(request()),
            ]);
            AuditLog::record('order.created', $order);
        });

        return (new OrderResource($order))
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

            $this->ledger->recordVoid($order);

            $order->update(['status' => OrderStatus::Voided->value]);
        });

        DB::afterCommit(function () use ($order) {
            SyncOutbox::create([
                'tenant_id' => $order->tenant_id,
                'kind' => 'void',
                'order_uuid' => $order->uuid,
                'payload' => ['uuid' => $order->uuid],
            ]);
            AuditLog::record('order.voided', $order);
        });

        return new OrderResource($order->load(['items', 'payments', 'customer', 'user', 'tenant', 'branch']));
    }

    private function validated(Request $request): array
    {
        $user = $request->user();

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
            // Device must belong to the same tenant — keeps a cashier from
            // attributing sales to another tenant's till.
            'device_id' => ['nullable', 'integer', function (string $attr, $value, $fail) use ($user) {
                if ($value === null) {
                    return;
                }
                if (! Device::where('id', $value)->where('tenant_id', $user->tenant_id)->exists()) {
                    $fail('The selected device is invalid.');
                }
            }],
        ]);
    }
}