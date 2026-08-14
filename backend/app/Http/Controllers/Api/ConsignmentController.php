<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Models\ProductConsignment;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class ConsignmentController extends Controller
{
    public function index(Request $request)
    {
        $consignments = ProductConsignment::query()
            ->with(['user', 'category'])
            ->when($request->filled('search'), function ($q) use ($request) {
                $term = $request->string('search');
                $q->where(fn ($inner) => $inner
                    ->where('name', 'like', "%{$term}%")
                    ->orWhere('barcode', 'like', "%{$term}%")
                    ->orWhere('model', 'like', "%{$term}%"));
            })
            ->latest()
            ->paginate($request->integer('per_page', 25))
            ->withQueryString();

        return response()->json($consignments);
    }

    public function store(Request $request)
    {
        $data = $this->validated($request);
        $data['tenant_id'] = $request->user()->tenant_id;
        $data['user_id'] = $request->user()->id;

        $consignment = ProductConsignment::create($data);

        DB::afterCommit(fn () => AuditLog::record('consignment.created', $consignment));

        return response()->json(['data' => $consignment->load(['user', 'category'])], 201);
    }

    public function show(ProductConsignment $consignment)
    {
        return response()->json(['data' => $consignment->load(['user', 'category'])]);
    }

    public function update(Request $request, ProductConsignment $consignment)
    {
        $consignment->update($this->validated($request));

        DB::afterCommit(fn () => AuditLog::record('consignment.updated', $consignment));

        return response()->json(['data' => $consignment->load(['user', 'category'])]);
    }

    public function destroy(ProductConsignment $consignment)
    {
        $consignment->delete();

        DB::afterCommit(fn () => AuditLog::record('consignment.deleted', $consignment));

        return response()->json(['message' => 'Consignment deleted']);
    }

    private function validated(Request $request): array
    {
        return $request->validate([
            'name' => ['required', 'string', 'max:191'],
            'description' => ['nullable', 'string'],
            'model' => ['nullable', 'string', 'max:120'],
            'size' => ['nullable', 'string', 'max:120'],
            'department' => ['nullable', 'string', 'max:120'],
            'category' => ['nullable', 'string', 'max:120'],
            'category_id' => ['nullable', 'integer', 'exists:product_categories,id'],
            'quantity' => ['required', 'numeric', 'min:0'],
            'unit_cost' => ['required', 'numeric', 'min:0'],
            'unit_price' => ['required', 'numeric', 'min:0'],
            'unit_profit' => ['nullable', 'numeric'],
            'image' => ['nullable', 'string', 'max:255'],
            'consignment' => ['nullable', 'string', 'max:191'],
            'manufacture_date' => ['nullable', 'date'],
            'expire_date' => ['nullable', 'date'],
            'date' => ['nullable', 'date'],
            'barcode' => ['nullable', 'string', 'max:191'],
        ]);
    }
}