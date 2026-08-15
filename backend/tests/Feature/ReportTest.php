<?php

namespace Tests\Feature;

use App\Enums\OrderStatus;
use App\Enums\Role;
use App\Models\Order;
use App\Models\Product;
use App\Models\ProductCard;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TenancyHelpers;
use Tests\TestCase;

class ReportTest extends TestCase
{
    use RefreshDatabase;
    use TenancyHelpers;

    private function makeOrder(int $tenantId, int $userId, string $number, string $status, string $total, string $paid): Order
    {
        return Order::create([
            'tenant_id' => $tenantId,
            'branch_id' => null,
            'user_id' => $userId,
            'number' => $number,
            'uuid' => $number,
            'subtotal' => $total,
            'discount' => 0,
            'total' => $total,
            'amount_paid' => $paid,
            'change' => 0,
            'status' => $status,
        ]);
    }

    public function test_sales_report_sums_total_amount_paid_and_count(): void
    {
        [$tenant, $branch] = $this->makeTenant('Store');
        $admin = $this->makeUser($tenant, $branch, Role::Admin);
        $cashier = $this->makeUser($tenant, $branch, Role::Staff);

        $this->makeOrder($tenant->id, $cashier->id, 'INV-000001', OrderStatus::Completed->value, '100', '100');
        $this->makeOrder($tenant->id, $cashier->id, 'INV-000002', OrderStatus::Completed->value, '200', '150');
        // Voided sales are excluded from the report.
        $this->makeOrder($tenant->id, $cashier->id, 'INV-000003', OrderStatus::Voided->value, '999', '999');

        $today = now()->toDateString();

        $this->actingAsUser($admin)
            ->getJson("/api/reports/sales?from={$today}&to={$today}")
            ->assertOk()
            ->assertJsonPath('sums.count', 2)
            ->assertJsonPath('sums.total', '300.0000')
            ->assertJsonPath('sums.amount_paid', '250.0000');
    }

    public function test_sales_audit_returns_per_product_movement_rows(): void
    {
        [$tenant, $branch] = $this->makeTenant('Store');
        $admin = $this->makeUser($tenant, $branch, Role::Admin);
        $product = Product::create([
            'tenant_id' => $tenant->id, 'name' => 'Soda',
            'quantity' => 10, 'cost_price' => 50, 'selling_price' => 100,
        ]);

        ProductCard::create([
            'tenant_id' => $tenant->id, 'product_id' => $product->id,
            'date' => now()->toDateString(),
            'opening' => 10, 'added' => 0, 'reversed' => 0, 'sold' => 4,
            'cost_price' => 50, 'selling_price' => 100,
        ]);

        $today = now()->toDateString();

        $this->actingAsUser($admin)
            ->getJson("/api/reports/sales-audit?from={$today}&to={$today}")
            ->assertOk()
            ->assertJsonPath('data.0.product_name', 'Soda')
            ->assertJsonPath('data.0.sold', '4.0000');
    }

    public function test_staff_sales_groups_by_staff_member(): void
    {
        [$tenant, $branch] = $this->makeTenant('Store');
        $admin = $this->makeUser($tenant, $branch, Role::Admin);
        $cashier = $this->makeUser($tenant, $branch, Role::Staff);

        $this->makeOrder($tenant->id, $cashier->id, 'INV-000010', OrderStatus::Completed->value, '300', '300');
        $this->makeOrder($tenant->id, $cashier->id, 'INV-000011', OrderStatus::Completed->value, '150', '150');

        $today = now()->toDateString();

        $this->actingAsUser($admin)
            ->getJson("/api/reports/staff-sales?from={$today}&to={$today}")
            ->assertOk()
            ->assertJsonPath('data.0.user_name', $cashier->name)
            ->assertJsonPath('data.0.sales_count', 2);
    }

    public function test_staff_sales_is_forbidden_for_non_admins(): void
    {
        [$tenant, $branch] = $this->makeTenant('Store');
        $supervisor = $this->makeUser($tenant, $branch, Role::Supervisor);

        $this->actingAsUser($supervisor)
            ->getJson('/api/reports/staff-sales')
            ->assertForbidden();
    }

    public function test_sales_audit_export_returns_an_xlsx_download(): void
    {
        [$tenant, $branch] = $this->makeTenant('Store');
        $admin = $this->makeUser($tenant, $branch, Role::Admin);

        $today = now()->toDateString();

        $response = $this->actingAsUser($admin)
            ->getJson("/api/reports/sales-audit/export?from={$today}&to={$today}");

        $response->assertOk()
            ->assertHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');

        $this->assertStringContainsString('.xlsx', $response->headers->get('Content-Disposition', ''));
    }

    public function test_dashboard_summary_excludes_voided_sales(): void
    {
        [$tenant, $branch] = $this->makeTenant('Store');
        $admin = $this->makeUser($tenant, $branch, Role::Admin);
        $cashier = $this->makeUser($tenant, $branch, Role::Staff);

        $this->makeOrder($tenant->id, $cashier->id, 'INV-000020', OrderStatus::Completed->value, '400', '400');
        $this->makeOrder($tenant->id, $cashier->id, 'INV-000021', OrderStatus::Voided->value, '999', '999');

        $this->actingAsUser($admin)
            ->getJson('/api/dashboard/summary')
            ->assertOk()
            ->assertJsonPath('today.count', 1)
            ->assertJsonPath('today.total', '400.0000');
    }
}