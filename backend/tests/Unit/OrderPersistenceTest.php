<?php

namespace Tests\Unit;

use App\Models\Product;
use App\Services\OrderPersistence;
use Symfony\Component\HttpKernel\Exception\HttpException;
use Tests\TenancyHelpers;
use Tests\TestCase;

class OrderPersistenceTest extends TestCase
{
    use TenancyHelpers;

    private function persistence(): OrderPersistence
    {
        return app(OrderPersistence::class);
    }

    private function item(Product $product, int $qty, int $unitPrice): array
    {
        return ['product_id' => $product->id, 'quantity' => $qty, 'unit_price' => $unitPrice];
    }

    private function data(array $items, string $uuid, int $tender, int $discount = 0): array
    {
        return [
            'uuid' => $uuid,
            'items' => $items,
            'discount' => $discount,
            'payments' => [['method' => 'cash', 'amount' => $tender]],
        ];
    }

    public function test_invoice_numbers_are_sequential_and_per_tenant(): void
    {
        [$tenantA, $branchA] = $this->makeTenant('Alpha');
        [$tenantB, $branchB] = $this->makeTenant('Beta');

        $productA = Product::create([
            'tenant_id' => $tenantA->id, 'name' => 'A', 'quantity' => 50, 'cost_price' => 1, 'selling_price' => 2,
        ]);
        $productB = Product::create([
            'tenant_id' => $tenantB->id, 'name' => 'B', 'quantity' => 50, 'cost_price' => 1, 'selling_price' => 2,
        ]);

        $first = $this->persistence()->create($this->data([$this->item($productA, 1, 2)], '11111111-1111-4111-8111-111111111111', 2), $tenantA->id, $branchA->id, null, null);
        $second = $this->persistence()->create($this->data([$this->item($productA, 1, 2)], '22222222-2222-4222-8222-222222222222', 2), $tenantA->id, $branchA->id, null, null);
        $other = $this->persistence()->create($this->data([$this->item($productB, 1, 2)], '33333333-3333-4333-8333-333333333333', 2), $tenantB->id, $branchB->id, null, null);

        $prefix = strtoupper(now()->format('yMd'));
        $this->assertSame($prefix.'001', $first->number);
        $this->assertSame($prefix.'002', $second->number);
        // Tenant B has its own independent sequence.
        $this->assertSame($prefix.'001', $other->number);
    }

    public function test_insufficient_stock_aborts_with_422_and_leaves_stock_intact(): void
    {
        [$tenant, $branch] = $this->makeTenant('Store');
        $product = Product::create([
            'tenant_id' => $tenant->id, 'name' => 'Soda', 'quantity' => 1, 'cost_price' => 1, 'selling_price' => 2,
        ]);

        try {
            $this->persistence()->create(
                $this->data([$this->item($product, 5, 2)], '44444444-4444-4444-8444-444444444444', 10),
                $tenant->id, $branch->id, null, null,
            );
            $this->fail('Expected a 422 for insufficient stock');
        } catch (HttpException $e) {
            $this->assertSame(422, $e->getStatusCode());
        }

        $this->assertSame('1.0000', (string) $product->fresh()->quantity);
    }

    public function test_unit_price_is_floored_at_cost(): void
    {
        [$tenant, $branch] = $this->makeTenant('Store');
        $product = Product::create([
            'tenant_id' => $tenant->id, 'name' => 'Soda', 'quantity' => 10, 'cost_price' => 80, 'selling_price' => 100,
        ]);

        $order = $this->persistence()->create(
            $this->data([$this->item($product, 2, 50)], '55555555-5555-4555-8555-555555555555', 160),
            $tenant->id, $branch->id, null, null,
        );

        // 2 units at the 80 cost floor = 160, not the offered 50.
        $this->assertSame('160.0000', $order->total);
        $this->assertSame('80.0000', (string) $order->items[0]->unit_price);
    }

    public function test_line_totals_use_bcmath_precision(): void
    {
        [$tenant, $branch] = $this->makeTenant('Store');
        $product = Product::create([
            'tenant_id' => $tenant->id, 'name' => 'Soda', 'quantity' => 10, 'cost_price' => 1, 'selling_price' => 3,
        ]);

        $order = $this->persistence()->create(
            $this->data([$this->item($product, 3, 3)], '66666666-6666-4666-8666-666666666666', 9),
            $tenant->id, $branch->id, null, null,
        );

        $this->assertSame('9.0000', $order->items[0]->line_total);
        $this->assertSame('9.0000', $order->subtotal);
        $this->assertSame('9.0000', $order->total);
        $this->assertSame('0.0000', $order->change);
    }

    public function test_tender_below_total_is_rejected(): void
    {
        [$tenant, $branch] = $this->makeTenant('Store');
        $product = Product::create([
            'tenant_id' => $tenant->id, 'name' => 'Soda', 'quantity' => 10, 'cost_price' => 1, 'selling_price' => 3,
        ]);

        try {
            $this->persistence()->create(
                $this->data([$this->item($product, 3, 3)], '77777777-7777-4777-8777-777777777777', 5),
                $tenant->id, $branch->id, null, null,
            );
            $this->fail('Expected a 422 for short tender');
        } catch (HttpException $e) {
            $this->assertSame(422, $e->getStatusCode());
        }
    }

    public function test_discount_exceeding_subtotal_is_rejected(): void
    {
        [$tenant, $branch] = $this->makeTenant('Store');
        $product = Product::create([
            'tenant_id' => $tenant->id, 'name' => 'Soda', 'quantity' => 10, 'cost_price' => 1, 'selling_price' => 3,
        ]);

        try {
            $this->persistence()->create(
                $this->data([$this->item($product, 3, 3)], '88888888-8888-4888-8888-888888888888', 1, 100),
                $tenant->id, $branch->id, null, null,
            );
            $this->fail('Expected a 422 for excessive discount');
        } catch (HttpException $e) {
            $this->assertSame(422, $e->getStatusCode());
        }
    }
}