<?php

namespace Database\Seeders;

use App\Enums\Role;
use App\Models\Branch;
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
        }
    }
}