<?php

namespace Tests\Feature;

use App\Models\AuditLog;
use App\Models\User;
use App\Notifications\ResetPasswordNotification;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\Password;
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

    public function test_forgot_password_dispatches_a_reset_link(): void
    {
        Notification::fake();

        [$tenant, $branch] = $this->makeTenant('Store');
        $user = $this->makeUser($tenant, $branch);

        $this->postJson('/api/auth/forgot-password', ['email' => $user->email])
            ->assertOk();

        Notification::assertSentTo($user, ResetPasswordNotification::class);
    }

    public function test_forgot_password_does_not_leak_unknown_emails(): void
    {
        Notification::fake();

        $this->postJson('/api/auth/forgot-password', ['email' => 'nobody@nowhere.test'])
            ->assertOk()
            ->assertJson(['message' => 'If that email is registered, a reset link has been sent.']);
    }

    public function test_reset_password_resets_and_revokes_tokens(): void
    {
        [$tenant, $branch] = $this->makeTenant('Store');
        $user = $this->makeUser($tenant, $branch);
        $user->createToken('test')->plainTextToken;

        $token = Password::broker()->createToken($user);

        $this->assertNotEmpty(DB::table('password_reset_tokens')->where('email', $user->email)->value('token'));

        $this->postJson('/api/auth/reset-password', [
            'token' => $token,
            'email' => $user->email,
            'password' => 'new-secret-123',
            'password_confirmation' => 'new-secret-123',
        ])->assertOk();

        $this->assertTrue(Hash::check('new-secret-123', $user->fresh()->password));
        $this->assertFalse(Hash::check('password', $user->fresh()->password));
        $this->assertSame(0, DB::table('personal_access_tokens')->where('tokenable_id', $user->id)->count());
    }

    public function test_reset_password_rejects_a_bad_token(): void
    {
        [$tenant, $branch] = $this->makeTenant('Store');
        $user = $this->makeUser($tenant, $branch);

        $this->postJson('/api/auth/reset-password', [
            'token' => 'bogus-token',
            'email' => $user->email,
            'password' => 'new-secret-123',
            'password_confirmation' => 'new-secret-123',
        ])->assertUnprocessable();

        $this->assertTrue(Hash::check('password', $user->fresh()->password));
    }

    public function test_change_password_requires_the_current_password(): void
    {
        [$tenant, $branch] = $this->makeTenant('Store');
        $user = $this->makeUser($tenant, $branch);
        $token = $user->createToken('test')->plainTextToken;

        $this->withToken($token)->postJson('/api/auth/change-password', [
            'current_password' => 'wrong-password',
            'new_password' => 'new-secret-123',
        ])->assertUnprocessable();

        $this->assertTrue(Hash::check('password', $user->fresh()->password));
    }

    public function test_change_password_updates_and_drops_other_sessions(): void
    {
        [$tenant, $branch] = $this->makeTenant('Store');
        $user = $this->makeUser($tenant, $branch);

        $other = $user->createToken('other')->plainTextToken;
        $current = $user->createToken('current')->plainTextToken;

        $this->assertSame(2, DB::table('personal_access_tokens')->where('tokenable_id', $user->id)->count());

        $this->withToken($current)->postJson('/api/auth/change-password', [
            'current_password' => 'password',
            'new_password' => 'new-secret-123',
        ])->assertOk();

        $this->assertTrue(Hash::check('new-secret-123', $user->fresh()->password));
        // The current session survives; the other token is revoked.
        $remaining = DB::table('personal_access_tokens')->where('tokenable_id', $user->id)->pluck('name')->all();
        $this->assertSame(['current'], $remaining);
    }

    public function test_profile_can_be_read_and_updated(): void
    {
        [$tenant, $branch] = $this->makeTenant('Store');
        $user = $this->makeUser($tenant, $branch);
        $token = $user->createToken('test')->plainTextToken;

        $this->withToken($token)->getJson('/api/auth/profile')
            ->assertOk()
            ->assertJsonStructure(['user' => ['id', 'name', 'email'], 'profile']);

        $this->withToken($token)->putJson('/api/auth/profile', [
            'name' => 'Aisha Updated',
            'email' => $user->email,
            'profile' => [
                'fullname' => 'Aisha Bello',
                'phone' => '08010000000',
                'address' => '12 Market Road',
            ],
        ])->assertOk();

        $this->assertSame('Aisha Updated', $user->fresh()->name);
        $this->assertDatabaseHas('user_profiles', [
            'user_id' => $user->id,
            'fullname' => 'Aisha Bello',
            'phone' => '08010000000',
        ]);
    }
}