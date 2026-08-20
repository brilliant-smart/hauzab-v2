<?php

namespace Tests\Feature;

use App\Enums\OrderStatus;
use App\Models\DailyLog;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\Product;
use App\Models\ProductCard;
use App\Services\StockLedger;
use Illuminate\Support\Carbon;
use Tests\TenancyHelpers;
use Tests\TestCase;

class StockLedgerTest extends TestCase
{
    use TenancyHelpers;

    private function ledger(): StockLedger
    {
        return app(StockLedger::class);
    }

    public function test_seed_day_is_first_or_create_and_marks_a_daily_log(): void
    {
        [$tenant, $branch] = $this->makeTenant('Store');
        $product = Product::create([
            'tenant_id' => $tenant->id, 'name' => 'Soda',
            'quantity' => 12, 'cost_price' => 50, 'selling_price' => 100,
        ]);
        $date = Carbon::today();

        $card = $this->ledger()->seedDay($tenant->id, $product->id, null, $date);
        $again = $this->ledger()->seedDay($tenant->id, $product->id, null, $date);

        $this->assertSame($card->id, $again->id);
        $this->assertSame('12.0000', (string) $card->opening);
        $this->assertDatabaseHas('daily_logs', ['tenant_id' => $tenant->id, 'date' => $date->toDateString()]);
    }

    public function test_apply_sale_line_increments_sold(): void
    {
        [$tenant, $branch] = $this->makeTenant('Store');
        $product = Product::create([
            'tenant_id' => $tenant->id, 'name' => 'Soda',
            'quantity' => 12, 'cost_price' => 50, 'selling_price' => 100,
        ]);

        $this->ledger()->applySaleLine($tenant->id, $product->id, '3', null, Carbon::today());
        $this->ledger()->applySaleLine($tenant->id, $product->id, '2', null, Carbon::today());

        $card = ProductCard::first();
        $this->assertSame('5.0000', (string) $card->sold);
    }

    public function test_record_restock_increments_added(): void
    {
        [$tenant, $branch] = $this->makeTenant('Store');
        $product = Product::create([
            'tenant_id' => $tenant->id, 'name' => 'Soda',
            'quantity' => 12, 'cost_price' => 50, 'selling_price' => 100,
        ]);

        $this->ledger()->recordRestock($tenant->id, $product->id, '8', null);

        $card = ProductCard::first();
        $this->assertSame('8.0000', (string) $card->added);
        $this->assertSame('20.0000', $card->closing());
    }

    public function test_record_void_increments_reversed(): void
    {
        [$tenant, $branch] = $this->makeTenant('Store');
        $product = Product::create([
            'tenant_id' => $tenant->id, 'name' => 'Soda',
            'quantity' => 12, 'cost_price' => 50, 'selling_price' => 100,
        ]);

        $order = Order::create([
            'tenant_id' => $tenant->id, 'branch_id' => $branch->id,
            'number' => 'INV-000001', 'uuid' => '12345678-1234-4123-8123-123456789012',
            'subtotal' => 300, 'discount' => 0, 'total' => 300, 'amount_paid' => 300, 'change' => 0,
            'status' => OrderStatus::Completed->value,
        ]);
        OrderItem::create([
            'order_id' => $order->id, 'product_id' => $product->id,
            'product_name' => 'Soda', 'quantity' => 3,
            'unit_price' => 100, 'cost_price' => 50, 'line_total' => 300,
        ]);

        $this->ledger()->recordVoid($order);

        $card = ProductCard::first();
        $this->assertSame('3.0000', (string) $card->reversed);
    }

    public function test_closing_equals_opening_plus_added_minus_sold(): void
    {
        [$tenant, $branch] = $this->makeTenant('Store');
        $product = Product::create([
            'tenant_id' => $tenant->id, 'name' => 'Soda',
            'quantity' => 10, 'cost_price' => 50, 'selling_price' => 100,
        ]);

        $this->ledger()->seedDay($tenant->id, $product->id, null, Carbon::today());
        $this->ledger()->recordRestock($tenant->id, $product->id, '5', null);
        $this->ledger()->applySaleLine($tenant->id, $product->id, '4', null, Carbon::today());

        $card = ProductCard::first();
        // opening 10 + added 5 - sold 4 = 11
        $this->assertSame('11.0000', $card->closing());
    }
}