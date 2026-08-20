<?php

namespace Tests\Feature;

use App\Enums\Role;
use App\Models\Product;
use App\Models\ProductConsignment;
use Tests\TenancyHelpers;
use Tests\TestCase;

/**
 * Receiving stock into the catalogue must also write a ProductConsignment row,
 * mirroring the legacy createProduct/restock flow. store() writes the full
 * initial qty, a restock update() writes only the delta, and a metadata-only
 * edit writes nothing (fixes the legacy bug that inflated the ledger on every
 * save).
 */
class ConsignmentAutoWriteTest extends TestCase
{
    use TenancyHelpers;

    private function admin(): array
    {
        [$tenant, $branch] = $this->makeTenant('Store');
        return [$tenant, $branch, $this->makeUser($tenant, $branch, Role::Admin)];
    }

    public function test_creating_a_product_writes_a_consignment_for_the_full_quantity(): void
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

        $this->assertSame(1, ProductConsignment::count());
        $consignment = ProductConsignment::first();
        $this->assertSame('Crate Juice', $consignment->name);
        $this->assertSame('12.0000', (string) $consignment->quantity);
        $this->assertSame('30.0000', (string) $consignment->unit_profit);
        $this->assertDatabaseHas('audit_logs', ['action' => 'consignment.created']);
    }

    public function test_a_restock_update_writes_a_consignment_for_the_delta_only(): void
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
            ->assertOk();

        // One delta row carrying the +6 increase.
        $this->assertSame(1, ProductConsignment::count());
        $this->assertSame('6.0000', (string) ProductConsignment::first()->quantity);
        $this->assertSame('16.0000', (string) $product->fresh()->quantity);

        // The day's card records the restock as added.
        $this->assertDatabaseHas('product_cards', [
            'product_id' => $product->id,
            'added' => '6.0000',
            'sold' => '0.0000',
        ]);
    }

    public function test_a_metadata_only_update_writes_no_consignment(): void
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

        $this->assertSame(0, ProductConsignment::count());
        $this->assertSame('Crate Juice renamed', $product->fresh()->name);
    }
}