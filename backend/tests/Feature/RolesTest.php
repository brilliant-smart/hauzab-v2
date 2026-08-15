<?php

namespace Tests\Feature;

use App\Enums\Role;
use App\Models\Product;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TenancyHelpers;
use Tests\TestCase;

class RolesTest extends TestCase
{
    use RefreshDatabase;
    use TenancyHelpers;

    private array $productPayload = [
        'name' => 'Widget',
        'quantity' => 10,
        'cost_price' => 50,
        'selling_price' => 80,
    ];

    public function test_staff_cannot_create_products(): void
    {
        [$tenant, $branch] = $this->makeTenant('Store');
        $staff = $this->makeUser($tenant, $branch, Role::Staff);

        $this->actingAsUser($staff)
            ->postJson('/api/products', $this->productPayload)
            ->assertForbidden();
    }

    public function test_staff_cannot_list_users(): void
    {
        [$tenant, $branch] = $this->makeTenant('Store');
        $staff = $this->makeUser($tenant, $branch, Role::Staff);

        $this->actingAsUser($staff)->getJson('/api/users')->assertForbidden();
    }

    public function test_supervisor_can_create_products_but_cannot_view_staff_sales(): void
    {
        [$tenant, $branch] = $this->makeTenant('Store');
        $supervisor = $this->makeUser($tenant, $branch, Role::Supervisor);

        $this->actingAsUser($supervisor)
            ->postJson('/api/products', $this->productPayload)
            ->assertCreated();

        // staff-sales and the audit export are admin-only.
        $this->actingAsUser($supervisor)
            ->getJson('/api/reports/staff-sales')
            ->assertForbidden();
    }

    public function test_admin_can_access_everything(): void
    {
        [$tenant, $branch] = $this->makeTenant('Store');
        $admin = $this->makeUser($tenant, $branch, Role::Admin);

        $this->actingAsUser($admin)
            ->postJson('/api/products', $this->productPayload)
            ->assertCreated();

        $this->actingAsUser($admin)
            ->getJson('/api/reports/staff-sales')
            ->assertOk();

        $this->actingAsUser($admin)
            ->getJson('/api/reports/sales-audit/export')
            ->assertOk();
    }

    public function test_supervisor_cannot_assign_a_non_staff_role(): void
    {
        [$tenant, $branch] = $this->makeTenant('Store');
        $supervisor = $this->makeUser($tenant, $branch, Role::Supervisor);

        $this->actingAsUser($supervisor)
            ->postJson('/api/users', [
                'name' => 'New Hire',
                'email' => 'newhire@store.test',
                'password' => 'secret123',
                'role' => 'admin',
            ])
            ->assertUnprocessable()
            ->assertJsonPath('errors.role.0', 'Only administrators can assign that role.');
    }

    public function test_admin_can_assign_any_role(): void
    {
        [$tenant, $branch] = $this->makeTenant('Store');
        $admin = $this->makeUser($tenant, $branch, Role::Admin);

        $this->actingAsUser($admin)
            ->postJson('/api/users', [
                'name' => 'New Sup',
                'email' => 'newsup@store.test',
                'password' => 'secret123',
                'role' => 'supervisor',
            ])
            ->assertCreated();

        $this->assertDatabaseHas('users', ['email' => 'newsup@store.test', 'role' => 'supervisor']);
    }
}