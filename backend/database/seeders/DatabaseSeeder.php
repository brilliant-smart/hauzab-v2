<?php

namespace Database\Seeders;

use App\Enums\Role;
use App\Models\Branch;
use App\Models\Product;
use App\Models\ProductCategory;
use App\Models\ProductManufacturer;
use App\Models\ProductSupplier;
use App\Models\ProductUnit;
use App\Models\Tenant;
use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;

class DatabaseSeeder extends Seeder
{
    public function run(): void
    {
        $tenants = [
            ['name' => 'Hauzab Supermarket', 'slug' => 'supermarket'],
            ['name' => 'Hauzab Pharmacy', 'slug' => 'pharmacy'],
        ];

        $adminBySlug = [
            'supermarket' => ['name' => 'Supermarket Admin', 'email' => 'admin@hauzab.test'],
            'pharmacy' => ['name' => 'Pharmacy Admin', 'email' => 'pharm@hauzab.test'],
        ];

        // Sample catalog per tenant. The pharmacy gets units/categories that fit
        // a dispensing business so the two tenants visibly differ.
        $catalog = [
            'supermarket' => [
                'units' => ['Carton', 'Piece', 'Box', 'Bag'],
                'categories' => ['Provisions', 'Drinks', 'Toiletries', 'Household'],
                'manufacturers' => ['Nestle Nigeria', 'Dangote', 'Unilever'],
                'suppliers' => ['Lagos Wholesale Depot', 'Northern Distributors'],
            ],
            'pharmacy' => [
                'units' => ['Tablet', 'Bottle', 'Strip', 'Pack'],
                'categories' => ['Analgesics', 'Antibiotics', 'Vitamins', 'Topicals'],
                'manufacturers' => ['Emzor Pharma', 'May & Baker', 'Fidson'],
                'suppliers' => ['Pharmaceutical Distributors Ltd', 'Healthline Supplies'],
            ],
        ];

        foreach ($tenants as $data) {
            $tenant = Tenant::firstOrCreate(['slug' => $data['slug']], $data);

            $branch = Branch::firstOrCreate(
                ['tenant_id' => $tenant->id, 'name' => 'Main'],
                ['is_active' => true]
            );

            $admin = $adminBySlug[$tenant->slug];

            User::firstOrCreate(
                ['email' => $admin['email']],
                [
                    'name' => $admin['name'],
                    'password' => Hash::make('password'),
                    'role' => Role::Admin->value,
                    'tenant_id' => $tenant->id,
                    'branch_id' => $branch->id,
                    'is_active' => true,
                ]
            );

            // A supervisor and a front-line staff member for the same branch.
            foreach ([
                ['name' => ucfirst($tenant->slug) . ' Supervisor', 'email' => $tenant->slug . '.sup@hauzab.test', 'role' => Role::Supervisor->value],
                ['name' => ucfirst($tenant->slug) . ' Staff', 'email' => $tenant->slug . '.staff@hauzab.test', 'role' => Role::Staff->value],
            ] as $staff) {
                User::firstOrCreate(
                    ['email' => $staff['email']],
                    [
                        'name' => $staff['name'],
                        'password' => Hash::make('password'),
                        'role' => $staff['role'],
                        'tenant_id' => $tenant->id,
                        'branch_id' => $branch->id,
                        'is_active' => true,
                    ]
                );
            }

            $this->seedCatalog($tenant, $catalog[$tenant->slug]);
        }
    }

    private function seedCatalog(Tenant $tenant, array $catalog): void
    {
        $unitIds = [];
        foreach ($catalog['units'] as $name) {
            $unitIds[$name] = ProductUnit::firstOrCreate(
                ['tenant_id' => $tenant->id, 'name' => $name],
                ['description' => null]
            )->id;
        }

        $categoryIds = [];
        foreach ($catalog['categories'] as $name) {
            $categoryIds[$name] = ProductCategory::firstOrCreate(
                ['tenant_id' => $tenant->id, 'name' => $name],
                ['description' => null]
            )->id;
        }

        $manufacturerIds = [];
        foreach ($catalog['manufacturers'] as $name) {
            $manufacturerIds[$name] = ProductManufacturer::firstOrCreate(
                ['tenant_id' => $tenant->id, 'name' => $name]
            )->id;
        }

        $supplierIds = [];
        foreach ($catalog['suppliers'] as $name) {
            $supplierIds[$name] = ProductSupplier::firstOrCreate(
                ['tenant_id' => $tenant->id, 'name' => $name]
            )->id;
        }

        // A handful of products that exercise low-stock and expiry views.
        $samples = [
            ['name' => $catalog['categories'][0] . ' Sample A', 'qty' => 40, 'reorder' => 5, 'days' => 365],
            ['name' => $catalog['categories'][1] . ' Sample B', 'qty' => 2, 'reorder' => 10, 'days' => 365],
            ['name' => $catalog['categories'][2] . ' Sample C', 'qty' => 25, 'reorder' => 5, 'days' => 30],
            ['name' => $catalog['categories'][3] . ' Sample D', 'qty' => 15, 'reorder' => 8, 'days' => 400],
        ];

        foreach ($samples as $i => $s) {
            Product::firstOrCreate(
                ['tenant_id' => $tenant->id, 'name' => $s['name']],
                [
                    'category_id' => $categoryIds[$catalog['categories'][$i % count($catalog['categories'])]],
                    'unit_id' => $unitIds[$catalog['units'][0]],
                    'manufacturer_id' => $manufacturerIds[$catalog['manufacturers'][0]],
                    'supplier_id' => $supplierIds[$catalog['suppliers'][0]],
                    'quantity' => $s['qty'],
                    'cost_price' => 100 * ($i + 1),
                    'selling_price' => 150 * ($i + 1),
                    'reorder_level' => $s['reorder'],
                    'barcode' => sprintf('%s-%04d', strtoupper(substr($tenant->slug, 0, 3)), $i + 1),
                    'expire_date' => now()->addDays($s['days'])->toDateString(),
                    'is_active' => true,
                ]
            );
        }
    }
}