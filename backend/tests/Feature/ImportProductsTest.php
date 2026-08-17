<?php

namespace Tests\Feature;

use App\Enums\Role;
use App\Models\Product;
use App\Models\ProductConsignment;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
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
    use RefreshDatabase;
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
            ->assertHeaderContains('content-disposition', 'hauzab-product-template.xlsx');
    }
}