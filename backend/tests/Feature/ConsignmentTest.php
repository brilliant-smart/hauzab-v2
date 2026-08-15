<?php

namespace Tests\Feature;

use App\Enums\Role;
use App\Models\ProductConsignment;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TenancyHelpers;
use Tests\TestCase;

class ConsignmentTest extends TestCase
{
    use RefreshDatabase;
    use TenancyHelpers;

    private function admin(): array
    {
        [$tenant, $branch] = $this->makeTenant('Store');
        return [$tenant, $branch, $this->makeUser($tenant, $branch, Role::Admin)];
    }

    private function payload(array $overrides = []): array
    {
        return array_merge([
            'name' => 'Consignment Widget',
            'quantity' => 5,
            'unit_cost' => 100,
            'unit_price' => 150,
        ], $overrides);
    }

    public function test_an_admin_can_create_a_consignment_and_audit_is_written(): void
    {
        [$tenant, $branch, $admin] = $this->admin();

        $this->actingAsUser($admin)
            ->postJson('/api/consignments', $this->payload())
            ->assertCreated()
            ->assertJsonPath('data.name', 'Consignment Widget');

        $this->assertDatabaseHas('audit_logs', ['action' => 'consignment.created']);
    }

    public function test_consignments_require_a_name_quantity_and_prices(): void
    {
        [$tenant, $branch, $admin] = $this->admin();

        $this->actingAsUser($admin)
            ->postJson('/api/consignments', [])
            ->assertJsonValidationErrors(['name', 'quantity', 'unit_cost', 'unit_price']);
    }

    public function test_an_admin_can_update_and_delete_a_consignment(): void
    {
        [$tenant, $branch, $admin] = $this->admin();
        $consignment = ProductConsignment::create([
            'tenant_id' => $tenant->id, 'user_id' => $admin->id,
            'name' => 'Old', 'quantity' => 1, 'unit_cost' => 10, 'unit_price' => 20,
        ]);

        $this->actingAsUser($admin)
            ->putJson("/api/consignments/{$consignment->id}", $this->payload(['name' => 'Renamed']))
            ->assertOk()
            ->assertJsonPath('data.name', 'Renamed');

        $this->actingAsUser($admin)
            ->deleteJson("/api/consignments/{$consignment->id}")
            ->assertOk();

        $this->assertDatabaseMissing('product_consignments', ['id' => $consignment->id]);
    }

    public function test_consignments_are_tenant_scoped(): void
    {
        [$tenantA, $branchA] = $this->makeTenant('Alpha');
        [$tenantB, $branchB] = $this->makeTenant('Beta');
        $adminA = $this->makeUser($tenantA, $branchA, Role::Admin);
        $adminB = $this->makeUser($tenantB, $branchB, Role::Admin);

        ProductConsignment::create([
            'tenant_id' => $tenantA->id, 'user_id' => $adminA->id,
            'name' => 'Alpha Item', 'quantity' => 1, 'unit_cost' => 1, 'unit_price' => 2,
        ]);
        ProductConsignment::create([
            'tenant_id' => $tenantB->id, 'user_id' => $adminB->id,
            'name' => 'Beta Item', 'quantity' => 1, 'unit_cost' => 1, 'unit_price' => 2,
        ]);

        $this->actingAsUser($adminA)
            ->getJson('/api/consignments')
            ->assertOk()
            ->assertJsonPath('data.0.name', 'Alpha Item')
            ->assertJsonMissing(['name' => 'Beta Item']);
    }
}