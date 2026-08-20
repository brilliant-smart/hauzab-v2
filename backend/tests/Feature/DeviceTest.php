<?php

namespace Tests\Feature;

use App\Enums\Role;
use App\Models\Device;
use Tests\TenancyHelpers;
use Tests\TestCase;

/**
 * Device (till/tablet) admin. Device has no BelongsToTenant global scope, so the
 * controller scopes by hand; branch_id is optional (a device can be unassigned).
 */
class DeviceTest extends TestCase
{
    use TenancyHelpers;

    private function admin(): array
    {
        [$tenant, $branch] = $this->makeTenant('Store');
        return [$tenant, $branch, $this->makeUser($tenant, $branch, Role::Admin)];
    }

    public function test_an_admin_can_list_create_update_and_delete_devices(): void
    {
        [$tenant, $branch, $admin] = $this->admin();

        // Create without a branch (branch_id is nullable).
        $create = $this->actingAsUser($admin)
            ->postJson('/api/devices', ['name' => 'Till 1'])
            ->assertCreated();
        $deviceId = $create->json('data.id');

        $this->actingAsUser($admin)
            ->getJson('/api/devices')
            ->assertOk()
            ->assertJsonPath('data.0.name', 'Till 1');

        $this->actingAsUser($admin)
            ->putJson("/api/devices/{$deviceId}", [
                'name' => 'Till 1 renamed',
                'branch_id' => $branch->id,
                'is_active' => false,
            ])
            ->assertOk()
            ->assertJsonPath('data.name', 'Till 1 renamed')
            ->assertJsonPath('data.is_active', false);

        $this->actingAsUser($admin)
            ->deleteJson("/api/devices/{$deviceId}")
            ->assertOk();

        $this->assertDatabaseMissing('devices', ['id' => $deviceId]);
    }

    public function test_devices_are_tenant_scoped(): void
    {
        [$tenantA, $branchA] = $this->makeTenant('Alpha');
        [$tenantB, $branchB] = $this->makeTenant('Beta');
        $adminA = $this->makeUser($tenantA, $branchA, Role::Admin);

        $deviceA = Device::create(['tenant_id' => $tenantA->id, 'name' => 'Alpha Till', 'is_active' => true]);
        Device::create(['tenant_id' => $tenantB->id, 'name' => 'Beta Till', 'is_active' => true]);

        $this->actingAsUser($adminA)
            ->getJson('/api/devices')
            ->assertOk()
            ->assertJsonPath('data.0.name', 'Alpha Till')
            ->assertJsonMissing(['name' => 'Beta Till']);

        // Tenant A cannot read, update, or delete tenant B's device.
        $this->actingAsUser($adminA)
            ->getJson("/api/devices/{$deviceA->id}")
            ->assertOk();

        $deviceB = Device::where('tenant_id', $tenantB->id)->first();
        $this->actingAsUser($adminA)
            ->putJson("/api/devices/{$deviceB->id}", ['name' => 'hijacked'])
            ->assertNotFound();
        $this->actingAsUser($adminA)
            ->deleteJson("/api/devices/{$deviceB->id}")
            ->assertNotFound();

        $this->assertSame('Beta Till', $deviceB->fresh()->name);
    }

    public function test_branches_are_tenant_scoped(): void
    {
        [$tenantA, $branchA] = $this->makeTenant('Alpha');
        $this->makeTenant('Beta');
        $adminA = $this->makeUser($tenantA, $branchA, Role::Admin);

        $this->actingAsUser($adminA)
            ->getJson('/api/branches')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.id', $branchA->id);
    }
}