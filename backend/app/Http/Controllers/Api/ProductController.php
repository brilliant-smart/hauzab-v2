<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\ProductResource;
use App\Models\AuditLog;
use App\Models\Product;
use App\Models\ProductCategory;
use App\Models\ProductConsignment;
use App\Models\ProductManufacturer;
use App\Models\ProductSupplier;
use App\Models\ProductUnit;
use App\Services\StockLedger;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\Rule;
use PhpOffice\PhpSpreadsheet\Reader\Xlsx as XlsxReader;
use PhpOffice\PhpSpreadsheet\Shared\Date as SpreadsheetDate;
use PhpOffice\PhpSpreadsheet\Spreadsheet;
use PhpOffice\PhpSpreadsheet\Writer\Xlsx;

class ProductController extends Controller
{
    public function __construct(
        private readonly StockLedger $ledger,
    ) {
    }
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
        $user = $request->user();

        $product = DB::transaction(function () use ($data, $user) {
            $product = Product::create($data);

            // Open today's card with the initial stock as opening (no added).
            $this->ledger->seedDay($user->tenant_id, $product->id, $user->id, now());

            // Receiving stock into the catalogue also writes a consignment
            // row, mirroring the legacy createProduct flow.
            $this->writeConsignment($product, (string) $product->quantity, $user);

            return $product;
        });

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
        $data = $this->validated($request, $product);
        $user = $request->user();
        $oldQty = (string) $product->quantity;
        $newQty = (string) ($data['quantity'] ?? $oldQty);

        DB::transaction(function () use ($product, $data, $user, $oldQty, $newQty) {
            // A stock increase is a restock: record the delta as added before
            // applying the new quantity so the card's opening is the old stock.
            if (bccomp($newQty, $oldQty) > 0) {
                $delta = bcsub($newQty, $oldQty, 4);
                $this->ledger->recordRestock(
                    $product->tenant_id,
                    $product->id,
                    $delta,
                    $user->id,
                );
                // A restock also writes a consignment row carrying the added qty.
                $this->writeConsignment($product, $delta, $user);
            }

            $product->update($data);
        });

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

    /**
     * Bulk-import products from an .xlsx spreadsheet. Reads by header name
     * (not positionally), dedupes by barcode within the tenant, opens each
     * product's stock card, and writes a consignment row per imported line.
     */
    public function import(Request $request): JsonResponse
    {
        $request->validate(['file' => ['required', 'file', 'mimes:xlsx', 'max:5120']]);

        $user = $request->user();
        $tenantId = $user->tenant_id;

        $reader = new XlsxReader();
        $reader->setReadDataOnly(true);
        $spreadsheet = $reader->load($request->file('file')->getRealPath());
        $rows = $spreadsheet->getActiveSheet()->toArray(null, true, true, false);
        $spreadsheet->disconnectWorksheets();
        unset($spreadsheet);

        if (count($rows) < 2) {
            return response()->json(['message' => 'The file has no rows to import.'], 422);
        }

        $colMap = [];
        foreach (array_map(fn ($h) => $this->normalizeHeader((string) $h), $rows[0]) as $i => $header) {
            if ($header !== '' && ! isset($colMap[$header])) {
                $colMap[$header] = $i;
            }
        }

        $aliases = [
            'barcode' => ['barcode', 'bar code number', 'code'],
            'name' => ['name', 'product name', 'products name'],
            'size' => ['size', 'product size', 'product sizes'],
            'quantity' => ['quantity', 'qty', 'product qty'],
            'cost_price' => ['cost price', 'purchase price', 'cost_price'],
            'selling_price' => ['selling price', 'selling_price'],
            'department' => ['department', 'product department'],
            'reorder_level' => ['reorder level', 'order level', 'reorder_level'],
            'expire_date' => ['expire date', 'expiry date', 'prod expired date', 'expire_date'],
            'manufacture_date' => ['manufacture date', 'manufacture_date'],
            'category' => ['category', 'product category'],
            'unit' => ['unit', 'product unit'],
            'manufacturer' => ['manufacturer', 'product manufacturer'],
            'supplier' => ['supplier', 'product supplier'],
        ];

        $dataRows = array_slice($rows, 1);
        $errors = [];
        if (count($dataRows) > 5000) {
            $errors[] = 'File has more than 5000 rows; only the first 5000 were processed.';
            $dataRows = array_slice($dataRows, 0, 5000);
        }

        $imported = 0;
        $updated = 0;
        $skipped = 0;
        $batchId = uniqid('imp', true);

        foreach ($dataRows as $i => $row) {
            $rowNo = $i + 2;
            $name = trim((string) $this->cell($row, $colMap, $aliases['name']));

            if ($name === '') {
                $skipped++;
                continue;
            }

            try {
                $rowData = [
                    'name' => $name,
                    'barcode' => $this->nullableCell($row, $colMap, $aliases['barcode']),
                    'size' => $this->nullableCell($row, $colMap, $aliases['size']),
                    'quantity' => $this->cell($row, $colMap, $aliases['quantity']) ?? '0',
                    'cost_price' => $this->cell($row, $colMap, $aliases['cost_price']) ?? '0',
                    'selling_price' => $this->cell($row, $colMap, $aliases['selling_price']) ?? '0',
                    'department' => $this->nullableCell($row, $colMap, $aliases['department']),
                    'reorder_level' => $this->nullableCell($row, $colMap, $aliases['reorder_level']),
                    'expire_date' => $this->dateCell($row, $colMap, $aliases['expire_date']),
                    'manufacture_date' => $this->dateCell($row, $colMap, $aliases['manufacture_date']),
                    'category_id' => $this->lookupId($tenantId, ProductCategory::class, $row, $colMap, $aliases['category']),
                    'unit_id' => $this->lookupId($tenantId, ProductUnit::class, $row, $colMap, $aliases['unit']),
                    'manufacturer_id' => $this->lookupId($tenantId, ProductManufacturer::class, $row, $colMap, $aliases['manufacturer']),
                    'supplier_id' => $this->lookupId($tenantId, ProductSupplier::class, $row, $colMap, $aliases['supplier']),
                ];

                $validator = Validator::make($rowData, [
                    'name' => ['required', 'string', 'max:191'],
                    'quantity' => ['required', 'numeric', 'min:0'],
                    'cost_price' => ['required', 'numeric', 'min:0'],
                    'selling_price' => ['required', 'numeric', 'min:0'],
                    'barcode' => ['nullable', 'string', 'max:191'],
                    'expire_date' => ['nullable', 'date'],
                    'manufacture_date' => ['nullable', 'date', 'before_or_equal:today'],
                ]);
                if ($validator->fails()) {
                    $skipped++;
                    $errors[] = "Row {$rowNo} ({$name}): " . implode(', ', $validator->errors()->all());

                    continue;
                }

                DB::transaction(function () use ($rowData, $user, $tenantId, &$imported, &$updated) {
                    $barcode = $rowData['barcode'] !== '' ? $rowData['barcode'] : null;
                    $existing = $barcode
                        ? Product::where('tenant_id', $tenantId)->where('barcode', $barcode)->first()
                        : null;

                    if ($existing) {
                        $delta = (string) $rowData['quantity'];

                        // Record the restock delta BEFORE bumping the quantity so
                        // the card's opening is the pre-merge stock.
                        if (bccomp($delta, '0') > 0) {
                            $this->ledger->recordRestock($tenantId, $existing->id, $delta, $user->id);
                        }

                        $existing->fill([
                            'quantity' => bcadd((string) $existing->quantity, $delta, 4),
                            'cost_price' => $rowData['cost_price'] !== '0' ? $rowData['cost_price'] : $existing->cost_price,
                            'selling_price' => $rowData['selling_price'] !== '0' ? $rowData['selling_price'] : $existing->selling_price,
                            'size' => $rowData['size'] ?? $existing->size,
                            'department' => $rowData['department'] ?? $existing->department,
                            'reorder_level' => $rowData['reorder_level'] !== null ? (int) $rowData['reorder_level'] : $existing->reorder_level,
                            'expire_date' => $rowData['expire_date'] ?? $existing->expire_date,
                            'manufacture_date' => $rowData['manufacture_date'] ?? $existing->manufacture_date,
                            'category_id' => $rowData['category_id'] ?? $existing->category_id,
                            'unit_id' => $rowData['unit_id'] ?? $existing->unit_id,
                            'manufacturer_id' => $rowData['manufacturer_id'] ?? $existing->manufacturer_id,
                            'supplier_id' => $rowData['supplier_id'] ?? $existing->supplier_id,
                        ])->save();

                        $this->writeConsignment($existing, $delta, $user);
                        $updated++;
                    } else {
                        $createData = array_merge($rowData, ['tenant_id' => $tenantId, 'is_active' => true]);
                        // reorder_level is NOT NULL with a DB default; an explicit
                        // null would violate it, so coerce to 0 when the row omits it.
                        $createData['reorder_level'] = $createData['reorder_level'] ?? 0;
                        $product = Product::create($createData);
                        $this->ledger->seedDay($tenantId, $product->id, $user->id, now());
                        $this->writeConsignment($product, (string) $product->quantity, $user);
                        $imported++;
                    }
                });
            } catch (\Throwable $e) {
                $skipped++;
                $errors[] = "Row {$rowNo} ({$name}): " . $e->getMessage();
            }
        }

        DB::afterCommit(fn () => AuditLog::record('product.imported', null, ['batch' => $batchId, 'imported' => $imported, 'updated' => $updated, 'skipped' => $skipped]));

        return response()->json([
            'imported' => $imported,
            'updated' => $updated,
            'skipped' => $skipped,
            'errors' => $errors,
        ]);
    }

    /**
     * Download a blank .xlsx template with the import headers and a sample row.
     */
    public function importTemplate()
    {
        $spreadsheet = new Spreadsheet();
        $sheet = $spreadsheet->getActiveSheet();
        $sheet->fromArray([
            ['Barcode', 'Name', 'Size', 'Quantity', 'Cost Price', 'Selling Price', 'Department', 'Reorder Level', 'Expire Date', 'Category', 'Unit', 'Manufacturer', 'Supplier'],
            ['5012345678900', 'Sample Product', '500g', 100, 80, 120, 'Aisle 3', 10, '2027-01-31', 'Groceries', 'Carton', 'ACME', 'Northside Supply'],
        ], null, 'A1');

        $temp = tempnam(sys_get_temp_dir(), 'import-template') . '.xlsx';
        (new Xlsx($spreadsheet))->save($temp);

        return response()->download($temp, 'hauzab-product-template.xlsx', [
            'Content-Type' => 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        ])->deleteFileAfterSend();
    }

    /**
     * Write a ProductConsignment row for a product's received/restocked stock.
     * Shared by store(), update(), and import() so the consignment ledger
     * grows the same way for every entry path.
     */
    private function writeConsignment(Product $product, string $qty, $user): ProductConsignment
    {
        $consignment = ProductConsignment::create([
            'tenant_id' => $product->tenant_id,
            'user_id' => $user->id,
            'name' => $product->name,
            'size' => $product->size,
            'department' => $product->department,
            'model' => $product->model,
            'category_id' => $product->category_id,
            'quantity' => $qty,
            'unit_cost' => $product->cost_price,
            'unit_price' => $product->selling_price,
            'unit_profit' => bcsub((string) $product->selling_price, (string) $product->cost_price, 4),
            'manufacture_date' => $product->manufacture_date,
            'expire_date' => $product->expire_date,
            'date' => now()->toDateString(),
            'barcode' => $product->barcode,
            'image' => $product->image,
        ]);

        DB::afterCommit(fn () => AuditLog::record('consignment.created', $consignment));

        return $consignment;
    }

    private function normalizeHeader(string $header): string
    {
        return trim((string) preg_replace('/\s+/', ' ', strtolower($header)));
    }

    private function cell(array $row, array $colMap, array $aliases)
    {
        foreach ($aliases as $alias) {
            if (isset($colMap[$alias]) && $row[$colMap[$alias]] !== null) {
                return $row[$colMap[$alias]];
            }
        }

        return null;
    }

    private function nullableCell(array $row, array $colMap, array $aliases): ?string
    {
        $val = $this->cell($row, $colMap, $aliases);

        return $val === null || trim((string) $val) === '' ? null : trim((string) $val);
    }

    /**
     * Read a date cell: Excel serials are converted to a Y-m-d string; textual
     * dates are trimmed and left as-is for the validator to parse.
     */
    private function dateCell(array $row, array $colMap, array $aliases): ?string
    {
        $val = $this->cell($row, $colMap, $aliases);
        if ($val === null || (string) $val === '') {
            return null;
        }
        if (is_numeric($val)) {
            return SpreadsheetDate::excelToDateTimeObject($val)->format('Y-m-d');
        }

        return trim((string) $val);
    }

    /**
     * Resolve a lookup name (Category/Unit/Manufacturer/Supplier) to an id,
     * creating the row within the tenant if it doesn't exist yet.
     */
    private function lookupId(int $tenantId, string $modelClass, array $row, array $colMap, array $aliases): ?int
    {
        $name = $this->nullableCell($row, $colMap, $aliases);
        if ($name === null) {
            return null;
        }

        return $modelClass::firstOrCreate(
            ['tenant_id' => $tenantId, 'name' => $name],
        )->id;
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