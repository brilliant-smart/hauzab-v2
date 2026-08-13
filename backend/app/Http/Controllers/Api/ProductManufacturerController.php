<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\ProductManufacturer;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class ProductManufacturerController extends Controller
{
    public function index(Request $request)
    {
        $manufacturers = ProductManufacturer::query()
            ->when($request->boolean('with_products_count'), fn ($q) => $q->withCount('products'))
            ->orderBy('name')
            ->get();

        return response()->json(['data' => $manufacturers]);
    }

    public function store(Request $request)
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:120', Rule::unique('product_manufacturers')->where('tenant_id', $request->user()->tenant_id)],
            'address' => ['nullable', 'string', 'max:255'],
            'email' => ['nullable', 'email', 'max:120'],
            'phone' => ['nullable', 'string', 'max:60'],
        ]);

        $manufacturer = ProductManufacturer::create($data + ['tenant_id' => $request->user()->tenant_id]);

        return response()->json(['data' => $manufacturer], 201);
    }

    public function show(ProductManufacturer $productManufacturer)
    {
        return response()->json(['data' => $productManufacturer]);
    }

    public function update(Request $request, ProductManufacturer $productManufacturer)
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:120', Rule::unique('product_manufacturers')->where('tenant_id', $request->user()->tenant_id)->ignore($productManufacturer->id)],
            'address' => ['nullable', 'string', 'max:255'],
            'email' => ['nullable', 'email', 'max:120'],
            'phone' => ['nullable', 'string', 'max:60'],
        ]);

        $productManufacturer->update($data);

        return response()->json(['data' => $productManufacturer]);
    }

    public function destroy(ProductManufacturer $productManufacturer)
    {
        $productManufacturer->delete();

        return response()->json(['message' => 'Manufacturer deleted']);
    }
}