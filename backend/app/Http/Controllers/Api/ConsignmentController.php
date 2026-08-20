<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Concerns\StreamsExports;
use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Models\ProductConsignment;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use PhpOffice\PhpSpreadsheet\Spreadsheet;

class ConsignmentController extends Controller
{
    use StreamsExports;
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

        return response()->json(['message' => 'Stock receipt deleted']);
    }

    /** Stock receipts export to .xlsx — honours the same search filter (admin only). */
    public function export(Request $request)
    {
        $this->prepareExport();
        $tenantId = $request->user()->tenant_id;

        $spreadsheet = new Spreadsheet();
        $sheet = $spreadsheet->getActiveSheet();
        $headers = [
            'Date', 'Product', 'Model', 'Size', 'Barcode', 'Department', 'Category',
            'Quantity', 'Unit Cost', 'Unit Price', 'Profit', 'Manufacture Date', 'Expire Date', 'Received By',
        ];
        $sheet->fromArray([$headers], null, 'A1');

        $row = 2;
        $widths = array_map('strlen', $headers);

        $receipts = ProductConsignment::query()
            ->leftJoin('users', 'users.id', '=', 'product_consignments.user_id')
            ->where('product_consignments.tenant_id', $tenantId)
            ->when($request->filled('search'), function ($q) use ($request) {
                $term = $request->string('search');
                $q->where(fn ($inner) => $inner
                    ->where('product_consignments.name', 'like', "%{$term}%")
                    ->orWhere('product_consignments.barcode', 'like', "%{$term}%")
                    ->orWhere('product_consignments.model', 'like', "%{$term}%"));
            })
            ->orderByDesc('product_consignments.created_at')
            ->select(['product_consignments.*', 'users.name as user_name'])
            ->cursor();

        foreach ($receipts as $r) {
            $cells = [
                $r->date?->toDateString(),
                $r->name,
                $r->model,
                $r->size,
                $r->barcode,
                $r->department,
                $r->category,
                (float) $r->quantity,
                (float) $r->unit_cost,
                (float) $r->unit_price,
                (float) $r->unit_profit,
                $r->manufacture_date?->toDateString(),
                $r->expire_date?->toDateString(),
                $r->user_name,
            ];
            $this->trackWidths($widths, $cells);
            $sheet->fromArray([$cells], null, "A{$row}");
            // Force the barcode to a Text cell so long numeric barcodes don't
            // render as scientific notation (6.9311E+12) and leading zeros
            // survive. Column E (Barcode) is also marked Text (@) below.
            $this->writeTextCell($sheet, "E{$row}", $r->barcode);
            $row++;
        }

        // Unit Cost, Unit Price, Profit (1-indexed) get the sum-able number
        // format; Barcode (col 5) is marked Text so Excel never rewrites it.
        $this->styleSheet($sheet, $headers, [9, 10, 11], $widths, [5]);

        return $this->streamSpreadsheet($spreadsheet, $this->exportName('stock-receipts', null, null));
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