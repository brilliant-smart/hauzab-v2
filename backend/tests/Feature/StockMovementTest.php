<?php

namespace Tests\Feature;

use App\Enums\Role;
use App\Models\AuditLog;
use App\Models\Product;
use App\Models\ProductCategory;
use App\Models\StockMovement;
use Illuminate\Support\Carbon;
use Tests\TenancyHelpers;
use Tests\TestCase;

/**
 * The stock-action endpoints and their guards. Stock is owned by the
 * immutable movement ledger: received/write-off/count route through
 * StockMovementService, which locks the product, hard-blocks negatives, appends
 * the movement row, bumps the daily card, and persists the new quantity — and
 * writes a human audit row naming the product.
 *
 * Also covers the ProductController guards that structurally block the legacy
 * discrepancy classes: selling below cost, duplicate names, cross-tenant
 * category leaks, and selling expired stock at the register.
 */
class StockMovementTest extends TestCase
{
    use TenancyHelpers;

    private function admin(): array
    {
        [$tenant, $branch] = $this->makeTenant('Store');

        return [$tenant, $branch, $this->makeUser($tenant, $branch, Role::Admin)];
    }

    public function test_received_bumps_quantity_card_and_movement_with_an_audit_row(): void
    {
        [$tenant, $branch, $admin] = $this->admin();

        $product = Product::create([
            'tenant_id' => $tenant->id, 'name' => 'Crate Juice',
            'quantity' => 5, 'cost_price' => 50, 'selling_price' => 80,
        ]);

        $this->actingAsUser($admin)
            ->postJson("/api/products/{$product->id}/stock-received", [
                'quantity' => 10, 'reason' => 'purchase', 'note' => 'first batch',
            ])
            ->assertCreated();

        $this->assertSame('15.0000', (string) $product->fresh()->quantity);

        $movement = StockMovement::where('product_id', $product->id)->first();
        $this->assertNotNull($movement);
        $this->assertSame('received', $movement->type);
        $this->assertSame('10.0000', (string) $movement->delta);
        $this->assertSame('5.0000', (string) $movement->quantity_before);
        $this->assertSame('15.0000', (string) $movement->quantity_after);

        // The daily card carries the stock-in as added.
        $this->assertDatabaseHas('product_cards', [
            'product_id' => $product->id,
            'added' => '10.0000',
        ]);

        // The audit row names the product and says what happened.
        $this->assertDatabaseHas('audit_logs', [
            'action' => 'stock.received',
            'subject_name' => 'Crate Juice',
        ]);
        $log = AuditLog::where('action', 'stock.received')->latest('id')->first();
        $this->assertStringContainsString('Received 10', $log->description);
    }

    public function test_write_off_below_zero_is_blocked(): void
    {
        [$tenant, $branch, $admin] = $this->admin();

        $product = Product::create([
            'tenant_id' => $tenant->id, 'name' => 'Crate Juice',
            'quantity' => 3, 'cost_price' => 50, 'selling_price' => 80,
        ]);

        $this->actingAsUser($admin)
            ->postJson("/api/products/{$product->id}/write-off", ['quantity' => 10])
            ->assertStatus(422);

        // Stock is untouched by the refused write-off.
        $this->assertSame('3.0000', (string) $product->fresh()->quantity);
        $this->assertSame(0, StockMovement::where('product_id', $product->id)->count());
    }

    public function test_count_sets_quantity_to_the_counted_value(): void
    {
        [$tenant, $branch, $admin] = $this->admin();

        $product = Product::create([
            'tenant_id' => $tenant->id, 'name' => 'Crate Juice',
            'quantity' => 13, 'cost_price' => 50, 'selling_price' => 80,
        ]);

        $this->actingAsUser($admin)
            ->postJson("/api/products/{$product->id}/stock-count", ['counted' => 20, 'reason' => 'recount'])
            ->assertCreated();

        $this->assertSame('20.0000', (string) $product->fresh()->quantity);

        $movement = StockMovement::where('product_id', $product->id)->first();
        $this->assertSame('count', $movement->type);
        $this->assertSame('7.0000', (string) $movement->delta);     // 20 - 13
        $this->assertSame('20.0000', (string) $movement->quantity_after);
    }

    public function test_selling_an_expired_product_is_blocked_at_the_register(): void
    {
        [$tenant, $branch, $admin] = $this->admin();
        $cashier = $this->makeUser($tenant, $branch, Role::Staff);

        $product = Product::create([
            'tenant_id' => $tenant->id, 'name' => 'Expired Juice',
            'quantity' => 5, 'cost_price' => 50, 'selling_price' => 80,
            'expire_date' => Carbon::today()->subDay(),
        ]);

        $this->actingAsUser($cashier)
            ->postJson('/api/orders', [
                'uuid' => '11111111-1111-4111-8111-111111111111',
                'items' => [['product_id' => $product->id, 'quantity' => 1, 'unit_price' => 80]],
                'payments' => [['method' => 'cash', 'amount' => 80]],
            ])
            ->assertStatus(422);

        $this->assertSame('5.0000', (string) $product->fresh()->quantity);
    }

    public function test_creating_a_product_with_selling_price_below_cost_is_rejected(): void
    {
        [$tenant, $branch, $admin] = $this->admin();

        $this->actingAsUser($admin)
            ->postJson('/api/products', [
                'name' => 'Loss Leader', 'quantity' => 1, 'cost_price' => 100, 'selling_price' => 50,
            ])
            ->assertStatus(422);

        $this->assertDatabaseMissing('products', ['name' => 'Loss Leader']);
    }

    public function test_creating_a_product_with_a_duplicate_name_is_rejected(): void
    {
        [$tenant, $branch, $admin] = $this->admin();

        Product::create([
            'tenant_id' => $tenant->id, 'name' => 'Coke 60cl',
            'quantity' => 1, 'cost_price' => 50, 'selling_price' => 80,
        ]);

        $this->actingAsUser($admin)
            ->postJson('/api/products', [
                'name' => 'Coke 60cl', 'quantity' => 1, 'cost_price' => 50, 'selling_price' => 80,
            ])
            ->assertStatus(422);

        // Only the original row exists.
        $this->assertSame(1, Product::where('name', 'Coke 60cl')->count());
    }

    public function test_creating_a_product_with_a_cross_tenant_category_is_rejected(): void
    {
        [$tenant, $branch, $admin] = $this->admin();

        // A second tenant with its own category.
        [$otherTenant, $otherBranch] = $this->makeTenant('Other');
        $otherCategory = ProductCategory::create([
            'tenant_id' => $otherTenant->id, 'name' => 'Foreign Category',
        ]);

        $this->actingAsUser($admin)
            ->postJson('/api/products', [
                'name' => 'Leaky Product', 'quantity' => 1, 'cost_price' => 50, 'selling_price' => 80,
                'category_id' => $otherCategory->id,
            ])
            ->assertStatus(422);

        $this->assertDatabaseMissing('products', ['name' => 'Leaky Product']);
    }
}