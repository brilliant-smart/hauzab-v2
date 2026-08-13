<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\ProductSupplier;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class ProductSupplierController extends Controller
{
    public function index(Request $request)
    {
        $suppliers = ProductSupplier::query()
            ->when($request->boolean('with_products_count'), fn ($q) => $q->withCount('products'))
            ->orderBy('name')
            ->get();

        return response()->json(['data' => $suppliers]);
    }

    public function store(Request $request)
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:120', Rule::unique('product_suppliers')->where('tenant_id', $request->user()->tenant_id)],
            'address' => ['nullable', 'string', 'max:255'],
            'email' => ['nullable', 'email', 'max:120'],
            'phone' => ['nullable', 'string', 'max:60'],
        ]);

        $supplier = ProductSupplier::create($data + ['tenant_id' => $request->user()->tenant_id]);

        return response()->json(['data' => $supplier], 201);
    }

    public function show(ProductSupplier $productSupplier)
    {
        return response()->json(['data' => $productSupplier]);
    }

    public function update(Request $request, ProductSupplier $productSupplier)
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:120', Rule::unique('product_suppliers')->where('tenant_id', $request->user()->tenant_id)->ignore($productSupplier->id)],
            'address' => ['nullable', 'string', 'max:255'],
            'email' => ['nullable', 'email', 'max:120'],
            'phone' => ['nullable', 'string', 'max:60'],
        ]);

        $productSupplier->update($data);

        return response()->json(['data' => $productSupplier]);
    }

    public function destroy(ProductSupplier $productSupplier)
    {
        $productSupplier->delete();

        return response()->json(['message' => 'Supplier deleted']);
    }
}