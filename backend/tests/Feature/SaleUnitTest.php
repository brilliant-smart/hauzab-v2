<?php

namespace Tests\Feature;

use App\Enums\Role;
use App\Models\AuditLog;
use App\Models\Product;
use App\Models\ProductUnit;
use App\Models\StockMovement;
use Tests\TenancyHelpers;
use Tests\TestCase;

/**
 * Phase 2 — carton sale units (Odoo Model A). Stock stays in the base unit; a
 * product that sells as a carton gets a sale-unit row carrying a factor and a
 * carton price. The POS sends only the sale unit_id and the server resolves the
 * factor, so a cashier can't tamper with it. The ledger always decrements base
 * units (qty × factor), so singles and cartons reconcile to one stock number.
 *
 * Also covers the sale-unit config guards (admin/supervisor only; requires a
 * base unit; carton price floored at cost × factor), edit-time name uniqueness,
 * and the repackage (stock.transfer) movement.
 */
class SaleUnitTest extends TestCase
{
    use TenancyHelpers;

    private function world(string $name = 'Store'): array
    {
        [$tenant, $branch] = $this->makeTenant($name);
        $admin = $this->makeUser($tenant, $branch, Role::Admin);

        $piece = ProductUnit::create(['tenant_id' => $tenant->id, 'name' => 'Piece']);
        $carton = ProductUnit::create(['tenant_id' => $tenant->id, 'name' => 'Carton']);

        return [$tenant, $branch, $admin, $piece, $carton];
    }

    private function cartonProduct($tenant, $piece, $carton, $admin, int $baseQty = 100): Product
    {
        $product = Product::create([
            'tenant_id' => $tenant->id, 'name' => 'Crate Juice',
            'unit_id' => $piece->id,
            'quantity' => $baseQty, 'cost_price' => 50, 'selling_price' => 80,
        ]);

        $this->actingAsUser($admin)
            ->postJson("/api/products/{$product->id}/sale-units", [
                'unit_id' => $carton->id, 'factor' => 12, 'selling_price' => 1200,
            ])
            ->assertCreated();

        return $product->fresh();
    }

    public function test_a_carton_sale_decrements_base_unit_stock_by_factor(): void
    {
        [$tenant, $branch, $admin, $piece, $carton] = $this->world();
        $cashier = $this->makeUser($tenant, $branch, Role::Staff);
        $product = $this->cartonProduct($tenant, $piece, $carton, $admin, 100);

        $this->actingAsUser($cashier)
            ->postJson('/api/orders', [
                'uuid' => '11111111-1111-4111-8111-111111111111',
                'items' => [
                    ['product_id' => $product->id, 'quantity' => 2, 'unit_price' => 1200, 'unit_id' => $carton->id],
                ],
                'payments' => [['method' => 'cash', 'amount' => 2400]],
            ])
            ->assertCreated();

        // 2 cartons × factor 12 = 24 base units taken; 100 − 24 = 76.
        $this->assertSame('76.0000', (string) $product->fresh()->quantity);

        $movement = StockMovement::where('product_id', $product->id)->where('type', 'sale')->first();
        $this->assertNotNull($movement);
        $this->assertSame('-24.0000', (string) $movement->delta);
        $this->assertSame((string) $carton->id, (string) $movement->unit_id);
        $this->assertSame('12.0000', (string) $movement->factor);
    }

    public function test_a_base_unit_sale_is_unchanged_when_no_sale_unit_is_configured(): void
    {
        [$tenant, $branch, $admin, $piece, $carton] = $this->world();
        $cashier = $this->makeUser($tenant, $branch, Role::Staff);

        // No sale-unit row — behaves exactly like Phase 1.
        $product = Product::create([
            'tenant_id' => $tenant->id, 'name' => 'Plain Soda', 'unit_id' => $piece->id,
            'quantity' => 10, 'cost_price' => 50, 'selling_price' => 80,
        ]);

        $this->actingAsUser($cashier)
            ->postJson('/api/orders', [
                'uuid' => '22222222-2222-4222-8222-222222222222',
                'items' => [['product_id' => $product->id, 'quantity' => 3, 'unit_price' => 80]],
                'payments' => [['method' => 'cash', 'amount' => 240]],
            ])
            ->assertCreated();

        $this->assertSame('7.0000', (string) $product->fresh()->quantity);
        $movement = StockMovement::where('product_id', $product->id)->first();
        $this->assertNull($movement->unit_id);
        $this->assertNull($movement->factor);
    }

    public function test_insufficient_base_stock_for_a_carton_sale_is_rejected(): void
    {
        [$tenant, $branch, $admin, $piece, $carton] = $this->world();
        $cashier = $this->makeUser($tenant, $branch, Role::Staff);
        // 20 base units in stock; 2 cartons × 12 = 24 needed.
        $product = $this->cartonProduct($tenant, $piece, $carton, $admin, 20);

        $this->actingAsUser($cashier)
            ->postJson('/api/orders', [
                'uuid' => '33333333-3333-4333-8333-333333333333',
                'items' => [
                    ['product_id' => $product->id, 'quantity' => 2, 'unit_price' => 1200, 'unit_id' => $carton->id],
                ],
                'payments' => [['method' => 'cash', 'amount' => 2400]],
            ])
            ->assertStatus(422);

        $this->assertSame('20.0000', (string) $product->fresh()->quantity);
    }

    public function test_an_invalid_sale_unit_at_checkout_is_rejected(): void
    {
        [$tenant, $branch, $admin, $piece, $carton] = $this->world();
        $cashier = $this->makeUser($tenant, $branch, Role::Staff);
        $product = Product::create([
            'tenant_id' => $tenant->id, 'name' => 'Crate Juice', 'unit_id' => $piece->id,
            'quantity' => 100, 'cost_price' => 50, 'selling_price' => 80,
        ]);

        // The carton unit exists but no sale-unit is configured for this product.
        $this->actingAsUser($cashier)
            ->postJson('/api/orders', [
                'uuid' => '44444444-4444-4444-8444-444444444444',
                'items' => [
                    ['product_id' => $product->id, 'quantity' => 1, 'unit_price' => 1200, 'unit_id' => $carton->id],
                ],
                'payments' => [['method' => 'cash', 'amount' => 1200]],
            ])
            ->assertStatus(422);

        $this->assertSame('100.0000', (string) $product->fresh()->quantity);
    }

    public function test_a_carton_price_below_cost_for_its_factor_is_rejected(): void
    {
        [$tenant, $branch, $admin, $piece, $carton] = $this->world();
        $product = Product::create([
            'tenant_id' => $tenant->id, 'name' => 'Crate Juice', 'unit_id' => $piece->id,
            'quantity' => 100, 'cost_price' => 50, 'selling_price' => 80,
        ]);

        // cost 50 × factor 12 = 600 floor; 500 is below it.
        $this->actingAsUser($admin)
            ->postJson("/api/products/{$product->id}/sale-units", [
                'unit_id' => $carton->id, 'factor' => 12, 'selling_price' => 500,
            ])
            ->assertStatus(422);

        $this->assertDatabaseMissing('product_sale_units', ['product_id' => $product->id]);
    }

    public function test_a_sale_unit_requires_the_product_to_have_a_base_unit(): void
    {
        [$tenant, $branch, $admin, $piece, $carton] = $this->world();
        $product = Product::create([
            'tenant_id' => $tenant->id, 'name' => 'Crate Juice', 'unit_id' => null,
            'quantity' => 100, 'cost_price' => 50, 'selling_price' => 80,
        ]);

        $this->actingAsUser($admin)
            ->postJson("/api/products/{$product->id}/sale-units", [
                'unit_id' => $carton->id, 'factor' => 12, 'selling_price' => 1200,
            ])
            ->assertStatus(422);

        $this->assertDatabaseMissing('product_sale_units', ['product_id' => $product->id]);
    }

    public function test_sale_unit_config_is_limited_to_catalog_roles(): void
    {
        [$tenant, $branch, $admin, $piece, $carton] = $this->world();
        $supervisor = $this->makeUser($tenant, $branch, Role::Supervisor);
        $inventoryManager = $this->makeUser($tenant, $branch, Role::InventoryManager);
        $staff = $this->makeUser($tenant, $branch, Role::Staff);

        $product = Product::create([
            'tenant_id' => $tenant->id, 'name' => 'Crate Juice', 'unit_id' => $piece->id,
            'quantity' => 100, 'cost_price' => 50, 'selling_price' => 80,
        ]);

        $payload = ['unit_id' => $carton->id, 'factor' => 12, 'selling_price' => 1200];

        $this->actingAsUser($admin)->postJson("/api/products/{$product->id}/sale-units", $payload)->assertCreated();
        $product->fresh()->saleUnits()->delete();

        $this->actingAsUser($supervisor)->postJson("/api/products/{$product->id}/sale-units", $payload)->assertCreated();
        $product->fresh()->saleUnits()->delete();

        // The Inventory Manager converts products to base-unit stock, so pack
        // configuration goes with the job; front-line staff stay read-only.
        $this->actingAsUser($inventoryManager)->postJson("/api/products/{$product->id}/sale-units", $payload)->assertCreated();
        $product->fresh()->saleUnits()->delete();

        $this->actingAsUser($staff)->postJson("/api/products/{$product->id}/sale-units", $payload)->assertForbidden();
    }

    public function test_edit_time_name_uniqueness_blocks_renaming_to_an_existing_product(): void
    {
        [$tenant, $branch, $admin, $piece] = $this->world();

        Product::create([
            'tenant_id' => $tenant->id, 'name' => 'Coke 60cl', 'unit_id' => $piece->id,
            'quantity' => 10, 'cost_price' => 50, 'selling_price' => 80,
        ]);
        $pepsi = Product::create([
            'tenant_id' => $tenant->id, 'name' => 'Pepsi 60cl', 'unit_id' => $piece->id,
            'quantity' => 10, 'cost_price' => 50, 'selling_price' => 80,
        ]);

        $this->actingAsUser($admin)
            ->putJson("/api/products/{$pepsi->id}", [
                'name' => 'Coke 60cl', 'cost_price' => 50, 'selling_price' => 80,
                'unit_id' => $piece->id,
            ])
            ->assertStatus(422);

        // The rename did not land.
        $this->assertSame('Pepsi 60cl', $pepsi->fresh()->name);
    }

    public function test_a_repackage_records_a_zero_delta_transfer_movement_and_audit_row(): void
    {
        [$tenant, $branch, $admin, $piece, $carton] = $this->world();
        $product = $this->cartonProduct($tenant, $piece, $carton, $admin, 100);

        $this->actingAsUser($admin)
            ->postJson("/api/products/{$product->id}/repackage", [
                'unit_id' => $carton->id, 'quantity' => 5, 'note' => 'opened for shelf singles',
            ])
            ->assertCreated();

        // Stock is unchanged — a carton and its singles are the same base units.
        $this->assertSame('100.0000', (string) $product->fresh()->quantity);

        $movement = StockMovement::where('product_id', $product->id)->where('type', 'transfer')->first();
        $this->assertNotNull($movement);
        $this->assertSame('0.0000', (string) $movement->delta);
        $this->assertSame((string) $carton->id, (string) $movement->unit_id);

        $this->assertDatabaseHas('audit_logs', [
            'action' => 'stock.transfer',
            'subject_name' => 'Crate Juice',
        ]);
    }

    public function test_repackage_rejects_a_unit_that_is_not_a_configured_sale_unit(): void
    {
        [$tenant, $branch, $admin, $piece, $carton] = $this->world();
        $sachet = ProductUnit::create(['tenant_id' => $tenant->id, 'name' => 'Sachet']);
        $product = $this->cartonProduct($tenant, $piece, $carton, $admin, 100);

        // Sachet exists as a unit but is not a sale unit for this product.
        $this->actingAsUser($admin)
            ->postJson("/api/products/{$product->id}/repackage", [
                'unit_id' => $sachet->id, 'quantity' => 5,
            ])
            ->assertStatus(422);
    }
}