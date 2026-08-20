<?php

namespace Tests\Feature;

use App\Enums\Role;
use App\Models\Product;
use App\Models\ProductConsignment;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use PhpOffice\PhpSpreadsheet\Spreadsheet;
use PhpOffice\PhpSpreadsheet\Writer\Xlsx;
use Tests\TenancyHelpers;
use Tests\TestCase;

/**
 * Bulk product import reads an .xlsx by header name, dedupes by barcode within
 * the tenant, opens a stock card per product, and writes a consignment row per
 * imported line. Invalid rows are skipped and reported in {errors}.
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

        // One consignment for the new line (qty 10) and one for the merge delta (+5).
        $this->assertSame(2, ProductConsignment::count());
        $this->assertSame('10.0000', (string) ProductConsignment::orderBy('id')->first()->quantity);

        // The merged restock is recorded as added on the day's card; the new
        // product's card carries the initial stock as opening.
        $this->assertDatabaseHas('product_cards', [
            'product_id' => $product->id,
            'opening' => '10.0000',
            'added' => '5.0000',
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
}