<?php

namespace Tests;

use App\Enums\Role;
use App\Models\Branch;
use App\Models\Tenant;
use App\Models\User;

/**
 * Shared builders for the multi-tenant test world: tenants, branches, and
 * users in every role. The BelongsToTenant global scope is a no-op while no
 * user is authenticated, so these run unscoped during setUp.
 */
trait TenancyHelpers
{
    protected function makeTenant(string $name): array
    {
        $tenant = Tenant::create([
            'name' => $name,
            'slug' => strtolower(str_replace(' ', '-', $name)),
            'is_active' => true,
        ]);

        $branch = Branch::create([
            'tenant_id' => $tenant->id,
            'name' => 'Main',
            'is_active' => true,
        ]);

        return [$tenant, $branch];
    }

    protected function makeUser(Tenant $tenant, Branch $branch, Role $role = Role::Staff, bool $active = true): User
    {
        return User::factory()->create([
            'tenant_id' => $tenant->id,
            'branch_id' => $branch->id,
            'role' => $role->value,
            'is_active' => $active,
        ]);
    }

    protected function actingAsUser(User $user): self
    {
        return $this->actingAs($user, 'sanctum');
    }
}