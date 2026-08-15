<?php

namespace Tests\Feature;

use App\Models\AuditLog;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TenancyHelpers;
use Tests\TestCase;

class AuthTest extends TestCase
{
    use RefreshDatabase;
    use TenancyHelpers;

    public function test_login_issues_a_token_for_valid_credentials(): void
    {
        [$tenant, $branch] = $this->makeTenant('Store');
        $user = $this->makeUser($tenant, $branch);

        $response = $this->postJson('/api/auth/login', [
            'email' => $user->email,
            'password' => 'password',
        ]);

        $response->assertOk()
            ->assertJsonStructure(['token', 'user' => ['id', 'name', 'email', 'role', 'tenant_id']]);

        $this->assertNotEmpty($response->json('token'));
    }

    public function test_login_rejects_bad_credentials(): void
    {
        [$tenant, $branch] = $this->makeTenant('Store');
        $user = $this->makeUser($tenant, $branch);

        $this->postJson('/api/auth/login', [
            'email' => $user->email,
            'password' => 'wrong-password',
        ])->assertUnprocessable();
    }

    public function test_login_refuses_a_disabled_account(): void
    {
        [$tenant, $branch] = $this->makeTenant('Store');
        $user = $this->makeUser($tenant, $branch, active: false);

        $this->postJson('/api/auth/login', [
            'email' => $user->email,
            'password' => 'password',
        ])->assertUnprocessable();
    }

    public function test_a_new_login_revokes_previous_tokens(): void
    {
        [$tenant, $branch] = $this->makeTenant('Store');
        $user = $this->makeUser($tenant, $branch);

        $this->postJson('/api/auth/login', [
            'email' => $user->email,
            'password' => 'password',
        ])->assertOk();

        // Exactly one token row exists for the user after the first login.
        $firstRow = DB::table('personal_access_tokens')->where('tokenable_id', $user->id)->sole();

        $this->postJson('/api/auth/login', [
            'email' => $user->email,
            'password' => 'password',
        ])->assertOk();

        // Still exactly one row — the previous token was revoked, not stacked.
        $secondRow = DB::table('personal_access_tokens')->where('tokenable_id', $user->id)->sole();

        $this->assertNotEquals($firstRow->id, $secondRow->id);
    }

    public function test_me_returns_the_authenticated_user(): void
    {
        [$tenant, $branch] = $this->makeTenant('Store');
        $user = $this->makeUser($tenant, $branch);

        $token = $this->postJson('/api/auth/login', [
            'email' => $user->email,
            'password' => 'password',
        ])->json('token');

        $this->withToken($token)
            ->getJson('/api/auth/me')
            ->assertOk()
            ->assertJsonPath('user.id', $user->id);
    }

    public function test_login_records_an_audit_event(): void
    {
        [$tenant, $branch] = $this->makeTenant('Store');
        $user = $this->makeUser($tenant, $branch);

        $this->postJson('/api/auth/login', [
            'email' => $user->email,
            'password' => 'password',
        ])->assertOk();

        $this->assertDatabaseHas('audit_logs', [
            'user_id' => $user->id,
            'action' => 'auth.login',
        ]);
    }

    public function test_unauthenticated_requests_are_rejected(): void
    {
        $this->getJson('/api/auth/me')->assertUnauthorized();
    }
}