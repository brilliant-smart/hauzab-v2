<?php

namespace Tests\Feature;

use App\Enums\Role;
use App\Models\UserProfile;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TenancyHelpers;
use Tests\TestCase;

class UserTest extends TestCase
{
    use RefreshDatabase;
    use TenancyHelpers;

    public function test_an_admin_creates_a_user_with_a_profile_in_one_transaction(): void
    {
        [$tenant, $branch] = $this->makeTenant('Store');
        $admin = $this->makeUser($tenant, $branch, Role::Admin);

        $this->actingAsUser($admin)
            ->postJson('/api/users', [
                'name' => 'Jane Doe',
                'email' => 'jane@store.test',
                'password' => 'secret123',
                'role' => 'staff',
                'fullname' => 'Jane Doe',
                'designation' => 'Cashier',
                'salary' => 25000,
            ])
            ->assertCreated()
            ->assertJsonPath('data.email', 'jane@store.test');

        $this->assertDatabaseHas('users', ['email' => 'jane@store.test']);
        $this->assertDatabaseHas('user_profiles', ['fullname' => 'Jane Doe', 'designation' => 'Cashier']);
    }

    public function test_creating_a_user_requires_a_password(): void
    {
        [$tenant, $branch] = $this->makeTenant('Store');
        $admin = $this->makeUser($tenant, $branch, Role::Admin);

        $this->actingAsUser($admin)
            ->postJson('/api/users', [
                'name' => 'No Pass',
                'email' => 'nopass@store.test',
                'role' => 'staff',
            ])
            ->assertJsonValidationErrors(['password']);
    }

    public function test_updating_a_user_without_a_password_keeps_the_old_one(): void
    {
        [$tenant, $branch] = $this->makeTenant('Store');
        $admin = $this->makeUser($tenant, $branch, Role::Admin);
        $target = $this->makeUser($tenant, $branch, Role::Staff);
        $originalHash = $target->password;

        $this->actingAsUser($admin)
            ->putJson("/api/users/{$target->id}", [
                'name' => 'Renamed',
                'email' => $target->email,
                'role' => 'staff',
            ])
            ->assertOk();

        $this->assertSame('Renamed', $target->fresh()->name);
        $this->assertSame($originalHash, $target->fresh()->password);
    }

    public function test_a_user_cannot_delete_themselves(): void
    {
        [$tenant, $branch] = $this->makeTenant('Store');
        $admin = $this->makeUser($tenant, $branch, Role::Admin);

        $this->actingAsUser($admin)
            ->deleteJson("/api/users/{$admin->id}")
            ->assertStatus(422);

        $this->assertDatabaseHas('users', ['id' => $admin->id]);
    }
}