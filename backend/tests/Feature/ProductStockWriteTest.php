<?php

namespace Tests\Feature;

use App\Enums\Role;
use App\Models\AuditLog;
use App\Models\Product;
use App\Models\StockMovement;
use Tests\TenancyHelpers;
use Tests\TestCase;

/**
 * Stock is owned by the movement ledger, not the product form. Creating a
 * product books its opening stock as a "received" movement (with a product.created
 * audit row); a quantity change through the edit form is refused outright; a
 * metadata-only edit touches no stock.
 */
class ProductStockWriteTest extends TestCase
{
    use TenancyHelpers;

    private function admin(): array
    {
        [$tenant, $branch] = $this->makeTenant('Store');

        return [$tenant, $branch, $this->makeUser($tenant, $branch, Role::Admin)];
    }

    public function test_creating_a_product_books_opening_stock_as_a_received_movement(): void
    {
        [$tenant, $branch, $admin] = $this->admin();

        $this->actingAsUser($admin)
            ->postJson('/api/products', [
                'name' => 'Crate Juice',
                'quantity' => 12,
                'cost_price' => 50,
                'selling_price' => 80,
            ])
            ->assertCreated();

        $product = Product::first();
        $this->assertSame('12.0000', (string) $product->quantity);

        $movement = StockMovement::first();
        $this->assertNotNull($movement);
        $this->assertSame('received', $movement->type);
        $this->assertSame('12.0000', (string) $movement->delta);
        $this->assertSame('0.0000', (string) $movement->quantity_before);
        $this->assertSame('12.0000', (string) $movement->quantity_after);
        $this->assertSame('opening', $movement->reason);

        $this->assertDatabaseHas('audit_logs', [
            'action' => 'product.created',
            'subject_name' => 'Crate Juice',
        ]);
    }

    public function test_a_quantity_change_through_the_edit_form_is_refused(): void
    {
        [$tenant, $branch, $admin] = $this->admin();

        $product = Product::create([
            'tenant_id' => $tenant->id, 'name' => 'Crate Juice',
            'quantity' => 10, 'cost_price' => 50, 'selling_price' => 80,
        ]);

        $this->actingAsUser($admin)
            ->putJson("/api/products/{$product->id}", [
                'name' => 'Crate Juice',
                'quantity' => 16,
                'cost_price' => 50,
                'selling_price' => 80,
            ])
            ->assertStatus(422);

        // Stock is untouched by the refused edit.
        $this->assertSame('10.0000', (string) $product->fresh()->quantity);
        $this->assertSame(0, StockMovement::count());
    }

    public function test_a_metadata_only_update_touches_no_stock(): void
    {
        [$tenant, $branch, $admin] = $this->admin();

        $product = Product::create([
            'tenant_id' => $tenant->id, 'name' => 'Crate Juice',
            'quantity' => 10, 'cost_price' => 50, 'selling_price' => 80,
        ]);

        $this->actingAsUser($admin)
            ->putJson("/api/products/{$product->id}", [
                'name' => 'Crate Juice renamed',
                'quantity' => 10,
                'cost_price' => 50,
                'selling_price' => 90,
            ])
            ->assertOk();

        $this->assertSame('Crate Juice renamed', $product->fresh()->name);
        $this->assertSame(0, StockMovement::count());

        // The edit is audited with the changed fields.
        $this->assertDatabaseHas('audit_logs', ['action' => 'product.updated']);
    }
};