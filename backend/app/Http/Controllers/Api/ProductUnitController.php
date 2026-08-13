<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\ProductUnit;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class ProductUnitController extends Controller
{
    public function index(Request $request)
    {
        $units = ProductUnit::query()
            ->when($request->boolean('with_products_count'), fn ($q) => $q->withCount('products'))
            ->orderBy('name')
            ->get();

        return response()->json(['data' => $units]);
    }

    public function store(Request $request)
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:120', Rule::unique('product_units')->where('tenant_id', $request->user()->tenant_id)],
            'description' => ['nullable', 'string', 'max:255'],
        ]);

        $unit = ProductUnit::create($data + ['tenant_id' => $request->user()->tenant_id]);

        return response()->json(['data' => $unit], 201);
    }

    public function show(ProductUnit $productUnit)
    {
        return response()->json(['data' => $productUnit]);
    }

    public function update(Request $request, ProductUnit $productUnit)
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:120', Rule::unique('product_units')->where('tenant_id', $request->user()->tenant_id)->ignore($productUnit->id)],
            'description' => ['nullable', 'string', 'max:255'],
        ]);

        $productUnit->update($data);

        return response()->json(['data' => $productUnit]);
    }

    public function destroy(ProductUnit $productUnit)
    {
        $productUnit->delete();

        return response()->json(['message' => 'Unit deleted']);
    }
}