<?php

namespace Tests\Feature;

use App\Enums\Role;
use App\Models\AuditLog;
use App\Models\Product;
use App\Models\StockMovement;
use Tests\TenancyHelpers;
use Tests\TestCase;

/**
 * The audit trail and the stock ledger are append-only by model enforcement:
 * an existing row can never be re-saved, updated, or deleted — corrections are
 * new rows, never silent edits of history. A failed edit must throw rather than
 * quietly mutate the trail.
 */
class AuditLogImmutabilityTest extends TestCase
{
    use TenancyHelpers;

    private function product(): Product
    {
        [$tenant, $branch] = $this->makeTenant('Store');

        return Product::create([
            'tenant_id' => $tenant->id, 'name' => 'Soda',
            'quantity' => 1, 'cost_price' => 50, 'selling_price' => 80,
        ]);
    }

    public function test_an_audit_log_row_cannot_be_updated_or_deleted(): void
    {
        $product = $this->product();
        $log = AuditLog::record('product.created', $product, [], $product->name, 'Product added');
        $this->assertNotNull($log);
        $log = $log->fresh();

        $this->expectException(\RuntimeException::class);
        $log->update(['action' => 'tampered']);
    }

    public function test_an_audit_log_row_cannot_be_re_saved(): void
    {
        $product = $this->product();
        $log = AuditLog::record('product.created', $product);
        $log = $log->fresh();
        $log->description = 'tampered';

        $this->expectException(\RuntimeException::class);
        $log->save();
    }

    public function test_an_audit_log_row_cannot_be_deleted(): void
    {
        $product = $this->product();
        $log = AuditLog::record('product.created', $product);
        $log = $log->fresh();

        $this->expectException(\RuntimeException::class);
        $log->delete();
    }

    public function test_a_stock_movement_row_cannot_be_updated_or_deleted(): void
    {
        $product = $this->product();
        $movement = StockMovement::create([
            'tenant_id' => $product->tenant_id,
            'product_id' => $product->id,
            'type' => 'received',
            'delta' => '5',
            'quantity_before' => '0',
            'quantity_after' => '5',
            'reason' => 'opening',
        ]);
        $movement = $movement->fresh();

        $this->expectException(\RuntimeException::class);
        $movement->update(['reason' => 'tampered']);
    }

    public function test_a_stock_movement_row_cannot_be_deleted(): void
    {
        $product = $this->product();
        $movement = StockMovement::create([
            'tenant_id' => $product->tenant_id,
            'product_id' => $product->id,
            'type' => 'received',
            'delta' => '5',
            'quantity_before' => '0',
            'quantity_after' => '5',
        ]);
        $movement = $movement->fresh();

        $this->expectException(\RuntimeException::class);
        $movement->delete();
    }
}