<?php

namespace Tests\Feature;

use App\Enums\Role;
use App\Models\Product;
use Tests\TenancyHelpers;
use Tests\TestCase;

class RolesTest extends TestCase
{
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

    public function test_supervisor_cannot_access_employee_records(): void
    {
        // Employee records are admin-only; supervisors are blocked at the
        // middleware before any validation runs.
        [$tenant, $branch] = $this->makeTenant('Store');
        $supervisor = $this->makeUser($tenant, $branch, Role::Supervisor);

        $this->actingAsUser($supervisor)->getJson('/api/users')->assertForbidden();
        $this->actingAsUser($supervisor)
            ->postJson('/api/users', [
                'name' => 'New Hire',
                'email' => 'newhire@store.test',
                'password' => 'secret123',
                'role' => 'staff',
            ])
            ->assertForbidden();
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

    public function test_admin_can_assign_inventory_manager_role(): void
    {
        [$tenant, $branch] = $this->makeTenant('Store');
        $admin = $this->makeUser($tenant, $branch, Role::Admin);

        $this->actingAsUser($admin)
            ->postJson('/api/users', [
                'name' => 'Stock Only',
                'email' => 'stock@store.test',
                'password' => 'secret123',
                'role' => 'inventory_manager',
            ])
            ->assertCreated();

        $this->assertDatabaseHas('users', ['email' => 'stock@store.test', 'role' => 'inventory_manager']);
    }

    public function test_inventory_manager_can_manage_products_but_cannot_sell_or_reach_other_areas(): void
    {
        [$tenant, $branch] = $this->makeTenant('Store');
        $im = $this->makeUser($tenant, $branch, Role::InventoryManager);

        // Catalog management is allowed: create, read, and the import template.
        $this->actingAsUser($im)
            ->postJson('/api/products', $this->productPayload)
            ->assertCreated();
        $this->actingAsUser($im)->getJson('/api/products')->assertOk();
        $this->actingAsUser($im)
            ->getJson('/api/products/import/template')
            ->assertOk();

        // Selling, sales/customers browse, and every manager-only area are denied.
        $this->actingAsUser($im)->postJson('/api/orders', [])->assertForbidden();
        $this->actingAsUser($im)->getJson('/api/customers')->assertForbidden();
        $this->actingAsUser($im)->getJson('/api/dashboard/summary')->assertForbidden();
        $this->actingAsUser($im)->getJson('/api/reports/sales')->assertForbidden();
        $this->actingAsUser($im)->getJson('/api/consignments')->assertForbidden();
        $this->actingAsUser($im)->getJson('/api/users')->assertForbidden();
        $this->actingAsUser($im)->getJson('/api/audit-logs')->assertForbidden();
        $this->actingAsUser($im)->getJson('/api/devices')->assertForbidden();
    }
}