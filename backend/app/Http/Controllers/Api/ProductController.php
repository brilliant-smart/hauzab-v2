<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\ProductResource;
use App\Models\Product;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class ProductController extends Controller
{
    public function index(Request $request)
    {
        $products = Product::query()
            ->with(['category', 'unit', 'manufacturer', 'supplier'])
            ->when($request->filled('search'), function ($q) use ($request) {
                $term = $request->string('search');
                $q->where(fn ($inner) => $inner
                    ->where('name', 'like', "%{$term}%")
                    ->orWhere('barcode', 'like', "%{$term}%")
                    ->orWhere('model', 'like', "%{$term}%"));
            })
            ->when($request->filled('category_id'), fn ($q) => $q->where('category_id', $request->integer('category_id')))
            ->when($request->boolean('active_only'), fn ($q) => $q->where('is_active', true))
            ->latest()
            ->paginate($request->integer('per_page', 25))
            ->withQueryString();

        return ProductResource::collection($products)->response();
    }

    public function store(Request $request)
    {
        $data = $this->validated($request);
        $data['tenant_id'] = $request->user()->tenant_id;

        $product = Product::create($data);

        return (new ProductResource($product->load(['category', 'unit', 'manufacturer', 'supplier'])))
            ->response()
            ->setStatusCode(201);
    }

    public function show(Product $product)
    {
        return new ProductResource($product->load(['category', 'unit', 'manufacturer', 'supplier']));
    }

    public function update(Request $request, Product $product)
    {
        $product->update($this->validated($request, $product));

        return new ProductResource($product->load(['category', 'unit', 'manufacturer', 'supplier']));
    }

    public function destroy(Product $product)
    {
        $product->delete();

        return response()->json(['message' => 'Product deleted']);
    }

    public function lowStock(Request $request)
    {
        $products = Product::query()
            ->with(['category', 'unit'])
            ->whereColumn('quantity', '<=', 'reorder_level')
            ->orderBy('name')
            ->paginate($request->integer('per_page', 25))
            ->withQueryString();

        return ProductResource::collection($products)->response();
    }

    public function expiring(Request $request)
    {
        $days = $request->integer('days', 90);

        $products = Product::query()
            ->with(['category', 'unit'])
            ->whereNotNull('expire_date')
            ->whereDate('expire_date', '<=', now()->addDays($days))
            ->orderBy('expire_date')
            ->paginate($request->integer('per_page', 25))
            ->withQueryString();

        return ProductResource::collection($products)->response();
    }

    private function validated(Request $request, ?Product $product = null): array
    {
        $tenantId = $request->user()->tenant_id;

        return $request->validate([
            'name' => ['required', 'string', 'max:191'],
            'description' => ['nullable', 'string'],
            'size' => ['nullable', 'string', 'max:120'],
            'model' => ['nullable', 'string', 'max:120'],
            'department' => ['nullable', 'string', 'max:120'],
            'category_id' => ['nullable', 'integer', 'exists:product_categories,id'],
            'unit_id' => ['nullable', 'integer', 'exists:product_units,id'],
            'manufacturer_id' => ['nullable', 'integer', 'exists:product_manufacturers,id'],
            'supplier_id' => ['nullable', 'integer', 'exists:product_suppliers,id'],
            'quantity' => ['required', 'numeric', 'min:0'],
            'cost_price' => ['required', 'numeric', 'min:0'],
            'selling_price' => ['required', 'numeric', 'min:0'],
            'reorder_level' => ['nullable', 'integer', 'min:0'],
            'barcode' => ['nullable', 'string', 'max:191', Rule::unique('products')->where('tenant_id', $tenantId)->ignore($product?->id)],
            'image' => ['nullable', 'string', 'max:255'],
            'manufacture_date' => ['nullable', 'date', 'before_or_equal:today'],
            'expire_date' => ['nullable', 'date'],
            'is_active' => ['boolean'],
        ]);
    }
}