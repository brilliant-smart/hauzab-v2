<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Models\Product;
use App\Models\ProductSaleUnit;
use App\Models\ProductUnit;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

/**
 * Manage a product's non-base sale units (e.g. a Carton of 24 singles). Stock
 * stays in the base unit; a sale unit only adds a factor + price so the POS can
 * ring up cartons while the ledger decrements base units.
 */
class SaleUnitController extends Controller
{
    public function index(Product $product): JsonResponse
    {
        $units = $product->saleUnits()
            ->with('unit')
            ->orderBy('factor')
            ->get();

        return response()->json(['data' => $units->map(fn ($u) => $this->present($u))]);
    }

    public function store(Request $request, Product $product): JsonResponse
    {
        $tenantId = $request->user()->tenant_id;

        // A sale unit is a multiple of the base unit — it can't be configured
        // until the product itself has a base unit. The recount/rename fills
        // unit_id; sale units are set on the consolidated product afterwards.
        if ($product->unit_id === null) {
            abort(422, 'Set the product\'s base unit before adding a sale unit.');
        }

        $data = $request->validate([
            'unit_id' => [
                'required', 'integer',
                Rule::exists('product_units', 'id')->where('tenant_id', $tenantId),
                // The base unit is implicit at factor 1 — don't duplicate it.
                Rule::notIn([$product->unit_id]),
                // One sale unit per (product, unit).
                Rule::unique('product_sale_units', 'unit_id')->where('product_id', $product->id),
            ],
            'factor' => ['required', 'numeric', 'gt:0'],
            'selling_price' => ['required', 'numeric', 'min:0', function (string $attr, $value, $fail) use ($product) {
                // A sale unit must never be priced below cost: one carton costs
                // at least `factor` base units, so carton price >= cost * factor.
                $min = bcmul((string) $product->cost_price, (string) request('factor'), 4);
                if (bccomp((string) $value, $min) < 0) {
                    $fail('The sale unit price is below cost for this factor.');
                }
            }],
        ]);

        $saleUnit = DB::transaction(function () use ($data, $product, $tenantId) {
            return ProductSaleUnit::create([
                'tenant_id' => $tenantId,
                'product_id' => $product->id,
                'unit_id' => $data['unit_id'],
                'factor' => $data['factor'],
                'selling_price' => $data['selling_price'],
            ])->load('unit');
        });

        $unitName = $saleUnit->unit?->name ?? "unit {$saleUnit->unit_id}";

        DB::afterCommit(fn () => AuditLog::record(
            'sale_unit.created',
            $product,
            ['unit' => $unitName, 'factor' => $saleUnit->factor, 'selling_price' => $saleUnit->selling_price],
            $product->name,
            "Added sale unit {$unitName} (×{$saleUnit->factor}) to {$product->name}"
        ));

        return response()->json(['data' => $this->present($saleUnit)], 201);
    }

    public function destroy(Product $product, ProductSaleUnit $saleUnit): JsonResponse
    {
        abort_if($saleUnit->product_id !== $product->id, 404);

        $unitName = $saleUnit->unit?->name ?? "unit {$saleUnit->unit_id}";

        DB::transaction(fn () => $saleUnit->delete());

        DB::afterCommit(fn () => AuditLog::record(
            'sale_unit.deleted',
            $product,
            ['unit' => $unitName],
            $product->name,
            "Removed sale unit {$unitName} from {$product->name}"
        ));

        return response()->json(['message' => 'Sale unit removed']);
    }

    private function present(ProductSaleUnit $u): array
    {
        return [
            'id' => $u->id,
            'unit_id' => $u->unit_id,
            'unit' => $u->unit?->only(['id', 'name']),
            'factor' => $u->factor,
            'selling_price' => $u->selling_price,
        ];
    }
}