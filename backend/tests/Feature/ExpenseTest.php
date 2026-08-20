<?php

namespace Tests\Feature;

use App\Enums\Role;
use App\Models\ExpenseCategory;
use Tests\TenancyHelpers;
use Tests\TestCase;

class ExpenseTest extends TestCase
{
    use TenancyHelpers;

    private function admin(): array
    {
        [$tenant, $branch] = $this->makeTenant('Store');
        return [$tenant, $branch, $this->makeUser($tenant, $branch, Role::Admin)];
    }

    public function test_category_name_is_stored_uppercase(): void
    {
        [$tenant, $branch, $admin] = $this->admin();

        $this->actingAsUser($admin)
            ->postJson('/api/expense-categories', ['name' => 'rent'])
            ->assertCreated()
            ->assertJsonPath('data.name', 'RENT');
    }

    public function test_duplicate_category_name_is_rejected(): void
    {
        [$tenant, $branch, $admin] = $this->admin();

        $this->actingAsUser($admin)
            ->postJson('/api/expense-categories', ['name' => 'RENT'])
            ->assertCreated();

        $this->actingAsUser($admin)
            ->postJson('/api/expense-categories', ['name' => 'RENT'])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['name']);
    }

    public function test_an_expense_can_be_recorded_and_writes_an_audit_row(): void
    {
        [$tenant, $branch, $admin] = $this->admin();
        $category = ExpenseCategory::create(['tenant_id' => $tenant->id, 'name' => 'FUEL']);

        $this->actingAsUser($admin)
            ->postJson('/api/expenses', [
                'expense_category_id' => $category->id,
                'description' => 'Generator diesel',
                'amount' => 5000,
                'date' => now()->toDateString(),
            ])
            ->assertCreated()
            ->assertJsonPath('data.amount', '5000.0000');

        $this->assertDatabaseHas('expenses', ['description' => 'Generator diesel']);
        $this->assertDatabaseHas('audit_logs', ['action' => 'expense.created']);
    }

    public function test_expenses_require_a_description_and_amount(): void
    {
        [$tenant, $branch, $admin] = $this->admin();

        $this->actingAsUser($admin)
            ->postJson('/api/expenses', ['date' => now()->toDateString()])
            ->assertJsonValidationErrors(['description', 'amount']);
    }

    public function test_expenses_are_tenant_scoped(): void
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
}