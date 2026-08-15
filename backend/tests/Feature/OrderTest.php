<?php

namespace Tests\Feature;

use App\Enums\OrderStatus;
use App\Enums\Role;
use App\Models\Order;
use App\Models\Product;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TenancyHelpers;
use Tests\TestCase;

class OrderTest extends TestCase
{
    use RefreshDatabase;
    use TenancyHelpers;

    private function checkoutPayload(Product $product, string $uuid, int $qty = 2, int $unitPrice = 100, int $tender = 200): array
    {
        return [
            'uuid' => $uuid,
            'items' => [
                ['product_id' => $product->id, 'quantity' => $qty, 'unit_price' => $unitPrice],
            ],
            'payments' => [['method' => 'cash', 'amount' => $tender]],
        ];
    }

    public function test_a_sale_decrements_stock_and_assigns_a_per_tenant_invoice_number(): void
    {
        [$tenant, $branch] = $this->makeTenant('Store');
        $cashier = $this->makeUser($tenant, $branch, Role::Staff);
        $product = Product::create([
            'tenant_id' => $tenant->id, 'name' => 'Soda',
            'quantity' => 10, 'cost_price' => 50, 'selling_price' => 100,
        ]);

        $response = $this->actingAsUser($cashier)
            ->postJson('/api/orders', $this->checkoutPayload($product, '11111111-1111-4111-8111-111111111111'));

        $response->assertCreated()->assertJsonPath('data.number', 'INV-000001');
        $this->assertSame('8.0000', (string) $product->fresh()->quantity);
    }

    public function test_the_unit_price_is_floored_at_cost(): void
    {
        [$tenant, $branch] = $this->makeTenant('Store');
        $cashier = $this->makeUser($tenant, $branch, Role::Staff);
        $product = Product::create([
            'tenant_id' => $tenant->id, 'name' => 'Soda',
            'quantity' => 10, 'cost_price' => 80, 'selling_price' => 100,
        ]);

        // Offered below cost — the register must not sell at a loss.
        $response = $this->actingAsUser($cashier)
            ->postJson('/api/orders', $this->checkoutPayload($product, '22222222-2222-4222-8222-222222222222', 2, 50, 160));

        $response->assertCreated();
        $this->assertSame('160.0000', $response->json('data.total'));
    }

    public function test_insufficient_stock_is_rejected(): void
    {
        [$tenant, $branch] = $this->makeTenant('Store');
        $cashier = $this->makeUser($tenant, $branch, Role::Staff);
        $product = Product::create([
            'tenant_id' => $tenant->id, 'name' => 'Soda',
            'quantity' => 1, 'cost_price' => 50, 'selling_price' => 100,
        ]);

        $this->actingAsUser($cashier)
            ->postJson('/api/orders', $this->checkoutPayload($product, '33333333-3333-4333-8333-333333333333', 5, 100, 500))
            ->assertStatus(422);

        $this->assertSame('1.0000', (string) $product->fresh()->quantity);
    }

    public function test_a_retried_checkout_is_idempotent_on_uuid(): void
    {
        [$tenant, $branch] = $this->makeTenant('Store');
        $cashier = $this->makeUser($tenant, $branch, Role::Staff);
        $product = Product::create([
            'tenant_id' => $tenant->id, 'name' => 'Soda',
            'quantity' => 10, 'cost_price' => 50, 'selling_price' => 100,
        ]);

        $uuid = '44444444-4444-4444-8444-444444444444';
        $first = $this->actingAsUser($cashier)->postJson('/api/orders', $this->checkoutPayload($product, $uuid));
        $first->assertCreated();
        $orderId = $first->json('data.id');

        // Same uuid — server returns the original order, no second stock hit.
        $second = $this->actingAsUser($cashier)->postJson('/api/orders', $this->checkoutPayload($product, $uuid));
        $second->assertOk()->assertJsonPath('data.id', $orderId);

        $this->assertSame('8.0000', (string) $product->fresh()->quantity);
        $this->assertSame(1, Order::where('uuid', $uuid)->count());
    }

    public function test_staff_only_see_their_own_sales(): void
    {
        [$tenant, $branch] = $this->makeTenant('Store');
        $staffA = $this->makeUser($tenant, $branch, Role::Staff);
        $staffB = $this->makeUser($tenant, $branch, Role::Staff);
        $product = Product::create([
            'tenant_id' => $tenant->id, 'name' => 'Soda',
            'quantity' => 10, 'cost_price' => 50, 'selling_price' => 100,
        ]);

        $this->actingAsUser($staffA)->postJson('/api/orders', $this->checkoutPayload($product, '55555555-5555-4555-8555-555555555555'))->assertCreated();
        $this->actingAsUser($staffB)->postJson('/api/orders', $this->checkoutPayload($product, '66666666-6666-4666-8666-666666666666'))->assertCreated();

        $this->actingAsUser($staffA)
            ->getJson('/api/orders')
            ->assertOk()
            ->assertJsonPath('data.0.uuid', '55555555-5555-4555-8555-555555555555')
            ->assertJsonMissing(['uuid' => '66666666-6666-4666-8666-666666666666']);
    }

    public function test_a_new_sale_queues_the_cloud_push_and_audit_event(): void
    {
        [$tenant, $branch] = $this->makeTenant('Store');
        $cashier = $this->makeUser($tenant, $branch, Role::Staff);
        $product = Product::create([
            'tenant_id' => $tenant->id, 'name' => 'Soda',
            'quantity' => 10, 'cost_price' => 50, 'selling_price' => 100,
        ]);

        $this->actingAsUser($cashier)
            ->postJson('/api/orders', $this->checkoutPayload($product, '77777777-7777-4777-8777-777777777777'))
            ->assertCreated();

        $this->assertDatabaseHas('sync_outbox', ['kind' => 'order']);
        $this->assertDatabaseHas('audit_logs', ['action' => 'order.created']);
    }

    public function test_voiding_a_completed_sale_restores_stock(): void
    {
        [$tenant, $branch] = $this->makeTenant('Store');
        $supervisor = $this->makeUser($tenant, $branch, Role::Supervisor);
        $product = Product::create([
            'tenant_id' => $tenant->id, 'name' => 'Soda',
            'quantity' => 10, 'cost_price' => 50, 'selling_price' => 100,
        ]);

        $order = $this->actingAsUser($supervisor)
            ->postJson('/api/orders', $this->checkoutPayload($product, '88888888-8888-4888-8888-888888888888'))
            ->assertCreated()
            ->json('data.id');

        $this->assertSame('8.0000', (string) $product->fresh()->quantity);

        $this->actingAsUser($supervisor)
            ->postJson("/api/orders/{$order}/void")
            ->assertOk()
            ->assertJsonPath('data.status.value', OrderStatus::Voided->value);

        $this->assertSame('10.0000', (string) $product->fresh()->quantity);
    }
}