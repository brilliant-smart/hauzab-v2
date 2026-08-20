<?php

namespace Tests\Feature;

use App\Enums\OrderStatus;
use App\Enums\Role;
use App\Models\Order;
use App\Models\Product;
use App\Models\ProductCard;
use Illuminate\Support\Arr;
use PhpOffice\PhpSpreadsheet\Reader\Xlsx as XlsxReader;
use Tests\TenancyHelpers;
use Tests\TestCase;

class ReportTest extends TestCase
{
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

    public function test_sales_report_export_returns_an_xlsx_download(): void
    {
        [$tenant, $branch] = $this->makeTenant('Store');
        $admin = $this->makeUser($tenant, $branch, Role::Admin);
        $cashier = $this->makeUser($tenant, $branch, Role::Staff);

        $this->makeOrder($tenant->id, $cashier->id, 'INV-000030', OrderStatus::Completed->value, '120', '120');

        $today = now()->toDateString();

        $response = $this->actingAsUser($admin)
            ->getJson("/api/reports/sales/export?from={$today}&to={$today}");

        $response->assertOk()
            ->assertHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');

        $this->assertStringContainsString('.xlsx', $response->headers->get('Content-Disposition', ''));

        // Read the workbook back and confirm the header row + the one data row.
        $rows = $this->readExportRows($response);
        $this->assertSame(['Order ID', 'Date', 'Time', 'Cashier', 'Customer', 'Status', 'Items', 'Total', 'Amount Paid'], $rows[0]);
        $this->assertSame('Completed', Arr::get($rows, '1.5'));
        $this->assertSame(120.0, Arr::get($rows, '1.7'));
    }

    public function test_sales_history_export_returns_one_row_per_line_item(): void
    {
        [$tenant, $branch] = $this->makeTenant('Store');
        $admin = $this->makeUser($tenant, $branch, Role::Admin);
        $cashier = $this->makeUser($tenant, $branch, Role::Staff);

        $order = $this->makeOrder($tenant->id, $cashier->id, 'INV-000040', OrderStatus::Completed->value, '250', '250');
        $order->items()->create([
            'product_id' => null,
            'product_name' => 'Bread',
            'quantity' => 2,
            'unit_price' => '50',
            'line_total' => '100',
        ]);
        $order->items()->create([
            'product_id' => null,
            'product_name' => 'Milk',
            'quantity' => 3,
            'unit_price' => '50',
            'line_total' => '150',
        ]);

        $today = now()->toDateString();

        $response = $this->actingAsUser($admin)
            ->getJson("/api/reports/sales-history/export?from={$today}&to={$today}");

        $response->assertOk()
            ->assertHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');

        $this->assertStringContainsString('.xlsx', $response->headers->get('Content-Disposition', ''));

        $rows = $this->readExportRows($response);
        $this->assertSame(['Order ID', 'Date', 'Time', 'Cashier', 'Customer', 'Status', 'Product', 'Quantity', 'Unit Price', 'Line Total'], $rows[0]);
        // Header + one row per line item, nothing else.
        $this->assertCount(3, $rows);
        $this->assertSame('Bread', Arr::get($rows, '1.6'));
        $this->assertSame('Milk', Arr::get($rows, '2.6'));
    }

    public function test_sales_report_export_is_forbidden_for_non_admins(): void
    {
        [$tenant, $branch] = $this->makeTenant('Store');
        $supervisor = $this->makeUser($tenant, $branch, Role::Supervisor);

        $this->actingAsUser($supervisor)
            ->getJson('/api/reports/sales/export')
            ->assertForbidden();
    }

    public function test_staff_sales_export_returns_one_row_per_staff_member(): void
    {
        [$tenant, $branch] = $this->makeTenant('Store');
        $admin = $this->makeUser($tenant, $branch, Role::Admin);
        $cashier = $this->makeUser($tenant, $branch, Role::Staff);

        $this->makeOrder($tenant->id, $cashier->id, 'INV-000050', OrderStatus::Completed->value, '300', '300');
        $this->makeOrder($tenant->id, $cashier->id, 'INV-000051', OrderStatus::Completed->value, '150', '150');

        $today = now()->toDateString();

        $response = $this->actingAsUser($admin)
            ->getJson("/api/reports/staff-sales/export?from={$today}&to={$today}");

        $response->assertOk()
            ->assertHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');

        $this->assertStringContainsString('.xlsx', $response->headers->get('Content-Disposition', ''));

        $rows = $this->readExportRows($response);
        $this->assertSame(['Name', 'Sales', 'Amount'], $rows[0]);
        // Header + one row for the cashier, ordered by amount desc.
        $this->assertCount(2, $rows);
        $this->assertSame($cashier->name, Arr::get($rows, '1.0'));
        $this->assertSame(2, Arr::get($rows, '1.1'));
        $this->assertSame(450.0, Arr::get($rows, '1.2'));
    }

    public function test_staff_sales_export_is_forbidden_for_non_admins(): void
    {
        [$tenant, $branch] = $this->makeTenant('Store');
        $supervisor = $this->makeUser($tenant, $branch, Role::Supervisor);

        $this->actingAsUser($supervisor)
            ->getJson('/api/reports/staff-sales/export')
            ->assertForbidden();
    }

    /**
     * Read a downloaded .xlsx response back into a 0-indexed array of rows
     * (each row an array of cell values). Falls back to the streamed file path
     * when the test client did not buffer the body into getContent().
     */
    private function readExportRows($response): array
    {
        $bytes = $response->getContent();

        if ($bytes === '' || $bytes === false) {
            $base = $response->baseResponse;
            if (method_exists($base, 'getFile')) {
                $bytes = file_get_contents($base->getFile()->getPathname());
            }
        }

        $temp = tempnam(sys_get_temp_dir(), 'exptest').'.xlsx';
        file_put_contents($temp, $bytes);

        $sheet = (new XlsxReader)->load($temp)->getActiveSheet();
        @unlink($temp);

        return $sheet->toArray(null, true, false, false);
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