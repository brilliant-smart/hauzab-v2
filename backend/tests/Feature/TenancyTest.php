<?php

namespace Tests\Feature;

use App\Enums\Role;
use App\Models\ExpenseCategory;
use App\Models\Product;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TenancyHelpers;
use Tests\TestCase;

class TenancyTest extends TestCase
{
    use RefreshDatabase;
    use TenancyHelpers;

    public function test_products_are_isolated_per_tenant_on_read(): void
    {
        [$tenantA, $branchA] = $this->makeTenant('Alpha');
        [$tenantB, $branchB] = $this->makeTenant('Beta');

        $adminA = $this->makeUser($tenantA, $branchA, Role::Admin);
        $adminB = $this->makeUser($tenantB, $branchB, Role::Admin);

        Product::create([
            'tenant_id' => $tenantA->id, 'name' => 'Alpha Bread',
            'quantity' => 10, 'cost_price' => 50, 'selling_price' => 80,
        ]);
        Product::create([
            'tenant_id' => $tenantB->id, 'name' => 'Beta Milk',
            'quantity' => 10, 'cost_price' => 50, 'selling_price' => 80,
        ]);

        $this->actingAsUser($adminA)
            ->getJson('/api/products')
            ->assertOk()
            ->assertJsonPath('data.0.name', 'Alpha Bread')
            ->assertJsonMissing(['name' => 'Beta Milk']);

        $this->actingAsUser($adminB)
            ->getJson('/api/products')
            ->assertOk()
            ->assertJsonPath('data.0.name', 'Beta Milk')
            ->assertJsonMissing(['name' => 'Alpha Bread']);
    }

    public function test_a_user_cannot_show_another_tenants_product(): void
    {
        [$tenantA, $branchA] = $this->makeTenant('Alpha');
        [$tenantB, $branchB] = $this->makeTenant('Beta');

        $adminA = $this->makeUser($tenantA, $branchA, Role::Admin);
        $productB = Product::create([
            'tenant_id' => $tenantB->id, 'name' => 'Beta Milk',
            'quantity' => 10, 'cost_price' => 50, 'selling_price' => 80,
        ]);

        // Route-model binding runs under the global scope, so a cross-tenant
        // id is not found → 404 rather than a leaked record.
        $this->actingAsUser($adminA)
            ->getJson("/api/products/{$productB->id}")
            ->assertNotFound();
    }

    public function test_a_user_cannot_update_another_tenants_product(): void
    {
        [$tenantA, $branchA] = $this->makeTenant('Alpha');
        [$tenantB, $branchB] = $this->makeTenant('Beta');

        $adminA = $this->makeUser($tenantA, $branchA, Role::Admin);
        $productB = Product::create([
            'tenant_id' => $tenantB->id, 'name' => 'Beta Milk',
            'quantity' => 10, 'cost_price' => 50, 'selling_price' => 80,
        ]);

        $this->actingAsUser($adminA)
            ->putJson("/api/products/{$productB->id}", [
                'name' => 'Hijacked', 'quantity' => 10,
                'cost_price' => 50, 'selling_price' => 80,
            ])
            ->assertNotFound();

        $this->assertSame('Beta Milk', $productB->fresh()->name);
    }

    public function test_expense_categories_are_isolated_per_tenant(): void
    {
        [$tenantA, $branchA] = $this->makeTenant('Alpha');
        [$tenantB, $branchB] = $this->makeTenant('Beta');

        $adminA = $this->makeUser($tenantA, $branchA, Role::Admin);
        ExpenseCategory::create(['tenant_id' => $tenantA->id, 'name' => 'RENT']);
        ExpenseCategory::create(['tenant_id' => $tenantB->id, 'name' => 'FUEL']);

        $this->actingAsUser($adminA)
            ->getJson('/api/expense-categories')
            ->assertOk()
            ->assertJsonPath('data.0.name', 'RENT')
            ->assertJsonMissing(['name' => 'FUEL']);
    }

    public function test_global_scope_is_a_noop_without_an_authenticated_user(): void
    {
        [$tenantA, $branchA] = $this->makeTenant('Alpha');
        [$tenantB, $branchB] = $this->makeTenant('Beta');

        Product::create([
            'tenant_id' => $tenantA->id, 'name' => 'Alpha Bread',
            'quantity' => 1, 'cost_price' => 1, 'selling_price' => 1,
        ]);
        Product::create([
            'tenant_id' => $tenantB->id, 'name' => 'Beta Milk',
            'quantity' => 1, 'cost_price' => 1, 'selling_price' => 1,
        ]);

        // No auth context (console/seeding path): every tenant's rows are visible.
        $this->assertSame(2, Product::count());
    }
}