<?php

namespace Tests\Feature;

use App\Enums\OrderStatus;
use App\Enums\Role;
use App\Models\Order;
use App\Models\Product;
use Tests\TenancyHelpers;
use Tests\TestCase;

class SyncTest extends TestCase
{
    use TenancyHelpers;

    protected function setUp(): void
    {
        parent::setUp();
        config(['sync.secret' => 'test-secret']);
    }

    private function headers(): array
    {
        return ['X-Sync-Secret' => 'test-secret'];
    }

    private function syncPayload(array $overrides = []): array
    {
        return array_merge([
            'uuid' => 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
            'items' => [],
            'payments' => [['method' => 'cash', 'amount' => 200]],
            'tenant_id' => 1,
            'branch_id' => 1,
            'user_id' => 1,
        ], $overrides);
    }

    public function test_store_order_is_idempotent_on_uuid(): void
    {
        [$tenant, $branch] = $this->makeTenant('Cloud');
        $user = $this->makeUser($tenant, $branch, Role::Staff);
        $product = Product::create([
            'tenant_id' => $tenant->id, 'name' => 'Soda',
            'quantity' => 10, 'cost_price' => 50, 'selling_price' => 100,
        ]);

        $payload = $this->syncPayload([
            'uuid' => 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
            'items' => [['product_id' => $product->id, 'quantity' => 2, 'unit_price' => 100]],
            'tenant_id' => $tenant->id,
            'branch_id' => $branch->id,
            'user_id' => $user->id,
        ]);

        $first = $this->withHeaders($this->headers())->postJson('/api/sync/orders', $payload);
        $first->assertCreated();
        $orderId = $first->json('data.id');

        // Retried push — same order, no second stock deduction.
        $second = $this->withHeaders($this->headers())->postJson('/api/sync/orders', $payload);
        $second->assertOk()->assertJsonPath('data.id', $orderId);

        $this->assertSame('8.0000', (string) $product->fresh()->quantity);
        $this->assertSame(1, Order::where('uuid', $payload['uuid'])->count());
    }

    public function test_void_returns_404_when_the_order_has_not_landed(): void
    {
        $this->withHeaders($this->headers())
            ->postJson('/api/sync/orders/cccccccc-cccc-4ccc-8ccc-cccccccccccc/void')
            ->assertNotFound();
    }

    public function test_void_returns_422_when_the_order_is_not_completed(): void
    {
        [$tenant, $branch] = $this->makeTenant('Cloud');

        $order = Order::create([
            'tenant_id' => $tenant->id, 'branch_id' => $branch->id,
            'number' => 'INV-000001', 'uuid' => 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
            'subtotal' => 0, 'discount' => 0, 'total' => 0, 'amount_paid' => 0, 'change' => 0,
            'status' => OrderStatus::Pending->value,
        ]);

        $this->withHeaders($this->headers())
            ->postJson("/api/sync/orders/{$order->uuid}/void")
            ->assertStatus(422);
    }

    public function test_void_is_idempotent_for_an_already_voided_order(): void
    {
        [$tenant, $branch] = $this->makeTenant('Cloud');

        $order = Order::create([
            'tenant_id' => $tenant->id, 'branch_id' => $branch->id,
            'number' => 'INV-000002', 'uuid' => 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
            'subtotal' => 0, 'discount' => 0, 'total' => 0, 'amount_paid' => 0, 'change' => 0,
            'status' => OrderStatus::Voided->value,
        ]);

        $this->withHeaders($this->headers())
            ->postJson("/api/sync/orders/{$order->uuid}/void")
            ->assertOk();
    }

    public function test_void_restores_stock_for_a_completed_order(): void
    {
        [$tenant, $branch] = $this->makeTenant('Cloud');
        $user = $this->makeUser($tenant, $branch, Role::Staff);
        $product = Product::create([
            'tenant_id' => $tenant->id, 'name' => 'Soda',
            'quantity' => 10, 'cost_price' => 50, 'selling_price' => 100,
        ]);

        $payload = $this->syncPayload([
            'uuid' => 'ffffffff-ffff-4fff-8fff-ffffffffffff',
            'items' => [['product_id' => $product->id, 'quantity' => 3, 'unit_price' => 100]],
            'payments' => [['method' => 'cash', 'amount' => 300]],
            'tenant_id' => $tenant->id,
            'branch_id' => $branch->id,
            'user_id' => $user->id,
        ]);

        $this->withHeaders($this->headers())->postJson('/api/sync/orders', $payload)->assertCreated();
        $this->assertSame('7.0000', (string) $product->fresh()->quantity);

        $this->withHeaders($this->headers())
            ->postJson("/api/sync/orders/{$payload['uuid']}/void")
            ->assertOk();

        $this->assertSame('10.0000', (string) $product->fresh()->quantity);
    }

    public function test_an_empty_sync_secret_is_a_server_fault(): void
    {
        config(['sync.secret' => '']);

        $this->withHeaders(['X-Sync-Secret' => 'anything'])
            ->postJson('/api/sync/orders', $this->syncPayload())
            ->assertStatus(500);
    }

    public function test_a_wrong_sync_secret_is_forbidden(): void
    {
        $this->withHeaders(['X-Sync-Secret' => 'wrong'])
            ->postJson('/api/sync/orders', $this->syncPayload())
            ->assertForbidden();
    }
}