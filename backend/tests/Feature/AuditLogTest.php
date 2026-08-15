<?php

namespace Tests\Feature;

use App\Enums\Role;
use App\Models\AuditLog;
use App\Models\Product;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Auth;
use Tests\TenancyHelpers;
use Tests\TestCase;

class AuditLogTest extends TestCase
{
    use RefreshDatabase;
    use TenancyHelpers;

    public function test_record_resolves_tenant_and_user_from_the_auth_context(): void
    {
        [$tenant, $branch] = $this->makeTenant('Store');
        $admin = $this->makeUser($tenant, $branch, Role::Admin);

        $this->actingAsUser($admin);

        $product = Product::create([
            'tenant_id' => $tenant->id, 'name' => 'Soda',
            'quantity' => 1, 'cost_price' => 1, 'selling_price' => 2,
        ]);

        $log = AuditLog::record('product.created', $product);

        $this->assertNotNull($log);
        $this->assertSame($admin->id, $log->user_id);
        $this->assertSame($tenant->id, $log->tenant_id);
        $this->assertSame('product.created', $log->action);
        $this->assertSame($product->id, $log->subject_id);
    }

    public function test_record_falls_back_to_the_subjects_tenant_without_auth(): void
    {
        [$tenant, $branch] = $this->makeTenant('Store');

        // Console path — no authenticated user.
        $this->assertNull(Auth::user());

        $product = Product::create([
            'tenant_id' => $tenant->id, 'name' => 'Soda',
            'quantity' => 1, 'cost_price' => 1, 'selling_price' => 2,
        ]);

        $log = AuditLog::record('product.created', $product);

        $this->assertNotNull($log);
        $this->assertNull($log->user_id);
        $this->assertSame($tenant->id, $log->tenant_id);
    }

    public function test_record_never_throws_when_auth_is_unavailable(): void
    {
        // No subject, no auth — must return null rather than throw.
        $log = AuditLog::record('system.event');

        // Either a row was written (tenant_id null) or it gracefully returned
        // null; either way the call did not raise.
        $this->assertTrue($log === null || $log instanceof AuditLog);
    }
}