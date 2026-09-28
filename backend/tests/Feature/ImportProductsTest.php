<?php

namespace Tests\Feature;

use App\Enums\Role;
use App\Models\Product;
use App\Models\StockMovement;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use PhpOffice\PhpSpreadsheet\Spreadsheet;
use PhpOffice\PhpSpreadsheet\Writer\Xlsx;
use Tests\TenancyHelpers;
use Tests\TestCase;

/**
 * Bulk product import reads an .xlsx by header name, matches existing products
 * by barcode then by name within the tenant, opens a stock card per new
 * product, and books each line's stock in as a "received" stock movement.
 * Invalid rows are skipped and reported in {errors}.
 */
class ImportProductsTest extends TestCase
{
    use TenancyHelpers;

    private function admin(): array
    {
        [$tenant, $branch] = $this->makeTenant('Store');
        return [$tenant, $branch, $this->makeUser($tenant, $branch, Role::Admin)];
    }

    private function buildUpload(array $rows): UploadedFile
    {
        $sheet = new Spreadsheet();
        $sheet->getActiveSheet()->fromArray($rows, null, 'A1');

        $temp = tempnam(sys_get_temp_dir(), 'import-test') . '.xlsx';
        (new Xlsx($sheet))->save($temp);
        $sheet->disconnectWorksheets();

        return UploadedFile::fake()->createWithContent('import.xlsx', file_get_contents($temp));
    }

    public function test_import_creates_products_writes_consignments_and_reports_skipped_rows(): void
    {
        [$tenant, $branch, $admin] = $this->admin();

        $upload = $this->buildUpload([
            ['Barcode', 'Name', 'Size', 'Quantity', 'Cost Price', 'Selling Price', 'Category'],
            ['501', 'Imported One', '1L', 10, 40, 60, 'Drinks'],
            ['', 'Bad Row', '', 'abc', 0, 0, ''],
            ['501', 'Imported One', '', 5, 0, 0, ''],
        ]);

        $response = $this->actingAsUser($admin)
            ->postJson('/api/products/import', ['file' => $upload])
            ->assertOk();

        $response->assertJsonPath('imported', 1)
            ->assertJsonPath('updated', 1)
            ->assertJsonPath('skipped', 1);

        $errors = $response->json('errors');
        $this->assertNotEmpty($errors);
        $this->assertStringContainsString('Row 3', $errors[0]);

        $product = Product::where('barcode', '501')->first();
        $this->assertNotNull($product);
        $this->assertSame('15.0000', (string) $product->quantity);
        $this->assertSame('40.0000', (string) $product->cost_price);

        // Each line's stock-in is a "received" movement: one for the new line
        // (qty 10) and one for the merge delta (+5).
        $movements = StockMovement::where('product_id', $product->id)->orderBy('id')->get();
        $this->assertSame(2, $movements->count());
        $this->assertSame('received', $movements->first()->type);
        $this->assertSame('10.0000', (string) $movements->first()->delta);
        $this->assertSame('5.0000', (string) $movements->last()->delta);

        // The product is created at 0 and the opening stock booked in as added,
        // so the card carries opening 0, added 15 (10 + 5), sold 0.
        $this->assertDatabaseHas('product_cards', [
            'product_id' => $product->id,
            'opening' => '0.0000',
            'added' => '15.0000',
            'sold' => '0.0000',
        ]);

        // The lookup name was resolved (and created) within the tenant.
        $this->assertDatabaseHas('product_categories', ['name' => 'Drinks']);
    }

    public function test_the_template_endpoint_returns_an_xlsx_download(): void
    {
        [$tenant, $branch, $admin] = $this->admin();

        $this->actingAsUser($admin)
            ->getJson('/api/products/import/template')
            ->assertOk()
            ->assertHeaderContains('content-disposition', 'attachment')
            ->assertHeaderContains('content-disposition', 'hauzab-product-template-')
            ->assertHeaderContains('content-disposition', '.xlsx');
    }

    // The product form uploads the image before saving; the endpoint stores it
    // on the public disk and hands back the path the form later sends as image.
    public function test_the_image_upload_endpoint_stores_and_returns_a_path(): void
    {
        Storage::fake('public');
        [$tenant, $branch, $admin] = $this->admin();

        $upload = UploadedFile::fake()->image('paracetamol.png', 120, 120);

        $response = $this->actingAsUser($admin)
            ->postJson('/api/products/image', ['file' => $upload])
            ->assertOk()
            ->assertJsonStructure(['path', 'url']);

        $path = $response->json('path');
        $this->assertStringStartsWith('products/', $path);
        $this->assertStringContainsString('/storage/'.$path, $response->json('url'));
        \Illuminate\Support\Facades\Storage::disk('public')->assertExists($path);
    }

    // The downloaded template ships the legacy header wording (including the
    // original "PRODUC EXPIRED DATE" spelling); a spreadsheet using those exact
    // headers must import cleanly, expire date included.
    public function test_import_accepts_the_legacy_template_headers(): void
    {
        [$tenant, $branch, $admin] = $this->admin();

        $upload = $this->buildUpload([
            ['BAR CODE NUMBER', 'PRODUCTS NAME', 'PRODUCT SIZES', 'PRODUCT QTY', 'PURCHASE PRICE', 'SELLING PRICE', 'PRODUCT DEPARTMENT', 'ORDER LEVEL', 'PRODUC EXPIRED DATE'],
            ['5012345678900', 'Paracetamol', '500mg', 100, 80, 120, 'Aisle 3', 10, '2027-01-31'],
        ]);

        $this->actingAsUser($admin)
            ->postJson('/api/products/import', ['file' => $upload])
            ->assertOk()
            ->assertJsonPath('imported', 1)
            ->assertJsonPath('updated', 0)
            ->assertJsonPath('skipped', 0);

        $product = Product::where('barcode', '5012345678900')->first();
        $this->assertNotNull($product);
        $this->assertSame('Paracetamol', $product->name);
        $this->assertSame('500mg', $product->size);
        $this->assertSame('100.0000', (string) $product->quantity);
        $this->assertSame('80.0000', (string) $product->cost_price);
        $this->assertSame('120.0000', (string) $product->selling_price);
        $this->assertSame('Aisle 3', $product->department);
        $this->assertSame(10, (int) $product->reorder_level);
        $this->assertSame('2027-01-31', $product->expire_date->format('Y-m-d'));
    }

    // A bulk-purchase sheet restocks products that already exist and leaves
    // the barcode column blank — the exact shape the store's restock imports
    // come in. The row must restock the named product, never error out.
    public function test_a_restock_row_matches_an_existing_product_by_name(): void
    {
        [$tenant, $branch, $admin] = $this->admin();

        $this->actingAsUser($admin)->postJson('/api/products', [
            'name' => 'Viva 1.7 Kg', 'quantity' => 4, 'cost_price' => 3875, 'selling_price' => 4300,
        ])->assertCreated();
        $product = Product::where('name', 'Viva 1.7 Kg')->first();

        $upload = $this->buildUpload([
            ['BAR CODE NUMBER', 'PRODUCTS NAME', 'PRODUCT SIZES', 'PRODUCT QTY', 'PURCHASE PRICE', 'SELLING PRICE', 'PRODUCT DEPARTMENT', 'ORDER LEVEL', 'PRODUC EXPIRED DATE'],
            ['', 'VIVA 1.7 KG', 'PSC', 16, 3875, 4300, 'GENERAL', 2, ''],
        ]);

        $this->actingAsUser($admin)
            ->postJson('/api/products/import', ['file' => $upload])
            ->assertOk()
            ->assertJsonPath('imported', 0)
            ->assertJsonPath('updated', 1)
            ->assertJsonPath('skipped', 0)
            ->assertJsonCount(0, 'errors');

        $product = $product->fresh();
        $this->assertSame('20.0000', (string) $product->quantity); // 4 + 16 received
        $this->assertSame('4300.0000', (string) $product->selling_price);

        // The restock is an audited received movement, reason "purchase".
        $movement = StockMovement::where('product_id', $product->id)
            ->where('type', 'received')->orderByDesc('id')->first();
        $this->assertSame('16.0000', (string) $movement->delta);
        $this->assertSame('purchase', $movement->reason);
    }

    // When the sheet does carry a barcode for an existing (barcode-less)
    // product, the name match fills it in so later imports match directly.
    public function test_a_name_matched_product_picks_up_its_barcode(): void
    {
        [$tenant, $branch, $admin] = $this->admin();

        $this->actingAsUser($admin)->postJson('/api/products', [
            'name' => 'Viva 330G', 'quantity' => 0, 'cost_price' => 808, 'selling_price' => 900,
        ])->assertCreated();
        $product = Product::where('name', 'Viva 330G')->first();
        $this->assertNull($product->barcode);

        $upload = $this->buildUpload([
            ['BAR CODE NUMBER', 'PRODUCTS NAME', 'PRODUCT QTY', 'PURCHASE PRICE', 'SELLING PRICE'],
            ['8801234567890', 'VIVA 330G', 52, 808, 900],
        ]);

        $this->actingAsUser($admin)
            ->postJson('/api/products/import', ['file' => $upload])
            ->assertOk()
            ->assertJsonPath('updated', 1)
            ->assertJsonPath('skipped', 0);

        $this->assertSame('8801234567890', $product->fresh()->barcode);
        $this->assertSame('52.0000', (string) $product->fresh()->quantity);
    }
}