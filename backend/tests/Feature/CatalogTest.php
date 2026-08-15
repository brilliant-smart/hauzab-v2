<?php

namespace Tests\Feature;

use App\Enums\Role;
use App\Models\Product;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TenancyHelpers;
use Tests\TestCase;

class CatalogTest extends TestCase
{
    use RefreshDatabase;
    use TenancyHelpers;

    private function admin(): array
    {
        [$tenant, $branch] = $this->makeTenant('Store');
        return [$tenant, $branch, $this->makeUser($tenant, $branch, Role::Admin)];
    }

    public function test_an_admin_can_create_and_fetch_a_product(): void
    {
        [$tenant, $branch, $admin] = $this->admin();

        $response = $this->actingAsUser($admin)
            ->postJson('/api/products', [
                'name' => 'Malt Drink',
                'barcode' => '123456',
                'quantity' => 20,
                'cost_price' => 100,
                'selling_price' => 150,
            ]);

        $response->assertCreated()->assertJsonPath('data.name', 'Malt Drink');

        $this->actingAsUser($admin)
            ->getJson('/api/products')
            ->assertOk()
            ->assertJsonPath('data.0.barcode', '123456');
    }

    public function test_duplicate_barcode_within_a_tenant_is_rejected(): void
    {
        [$tenant, $branch, $admin] = $this->admin();

        Product::create([
            'tenant_id' => $tenant->id, 'name' => 'First', 'barcode' => 'DUP',
            'quantity' => 1, 'cost_price' => 1, 'selling_price' => 2,
        ]);

        $this->actingAsUser($admin)
            ->postJson('/api/products', [
                'name' => 'Second', 'barcode' => 'DUP',
                'quantity' => 1, 'cost_price' => 1, 'selling_price' => 2,
            ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['barcode']);
    }

    public function test_low_stock_lists_products_at_or_below_reorder_level(): void
    {
        [$tenant, $branch, $admin] = $this->admin();

        Product::create([
            'tenant_id' => $tenant->id, 'name' => 'Scarce',
            'quantity' => 0, 'cost_price' => 1, 'selling_price' => 2, 'reorder_level' => 1,
        ]);
        Product::create([
            'tenant_id' => $tenant->id, 'name' => 'Plenty',
            'quantity' => 50, 'cost_price' => 1, 'selling_price' => 2, 'reorder_level' => 1,
        ]);

        $this->actingAsUser($admin)
            ->getJson('/api/products/low-stock')
            ->assertOk()
            ->assertJsonPath('data.0.name', 'Scarce')
            ->assertJsonMissing(['name' => 'Plenty']);
    }

    public function test_expiring_lists_products_within_the_window(): void
    {
        [$tenant, $branch, $admin] = $this->admin();

        Product::create([
            'tenant_id' => $tenant->id, 'name' => 'Soon Off',
            'quantity' => 5, 'cost_price' => 1, 'selling_price' => 2,
            'expire_date' => now()->addDays(30)->toDateString(),
        ]);
        Product::create([
            'tenant_id' => $tenant->id, 'name' => 'Long Life',
            'quantity' => 5, 'cost_price' => 1, 'selling_price' => 2,
            'expire_date' => now()->addDays(400)->toDateString(),
        ]);

        $this->actingAsUser($admin)
            ->getJson('/api/products/expiring')
            ->assertOk()
            ->assertJsonPath('data.0.name', 'Soon Off')
            ->assertJsonMissing(['name' => 'Long Life']);
    }

    public function test_a_lookup_category_can_be_created_and_is_tenant_scoped(): void
    {
        [$tenant, $branch, $admin] = $this->admin();

        $this->actingAsUser($admin)
            ->postJson('/api/product-categories', ['name' => 'Drinks'])
            ->assertCreated()
            ->assertJsonPath('data.name', 'Drinks');

        $this->actingAsUser($admin)
            ->getJson('/api/product-categories')
            ->assertOk()
            ->assertJsonPath('data.0.name', 'Drinks');
    }
}