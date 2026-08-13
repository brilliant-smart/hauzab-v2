<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\ProductCategory;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class ProductCategoryController extends Controller
{
    public function index(Request $request)
    {
        $categories = ProductCategory::query()
            ->when($request->boolean('with_products_count'), fn ($q) => $q->withCount('products'))
            ->orderBy('name')
            ->get();

        return response()->json(['data' => $categories]);
    }

    public function store(Request $request)
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:120', Rule::unique('product_categories')->where('tenant_id', $request->user()->tenant_id)],
            'description' => ['nullable', 'string', 'max:255'],
        ]);

        $category = ProductCategory::create($data + ['tenant_id' => $request->user()->tenant_id]);

        return response()->json(['data' => $category], 201);
    }

    public function show(ProductCategory $productCategory)
    {
        return response()->json(['data' => $productCategory]);
    }

    public function update(Request $request, ProductCategory $productCategory)
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:120', Rule::unique('product_categories')->where('tenant_id', $request->user()->tenant_id)->ignore($productCategory->id)],
            'description' => ['nullable', 'string', 'max:255'],
        ]);

        $productCategory->update($data);

        return response()->json(['data' => $productCategory]);
    }

    public function destroy(ProductCategory $productCategory)
    {
        $productCategory->delete();

        return response()->json(['message' => 'Category deleted']);
    }
}