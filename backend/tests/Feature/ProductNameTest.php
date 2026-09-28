<?php

namespace Tests\Feature;

use App\Enums\Role;
use App\Models\Product;
use Tests\TenancyHelpers;
use Tests\TestCase;

/**
 * Product names are canonicalized (trimmed, internal whitespace collapsed to
 * single spaces) before the uniqueness rule runs, so no spacing variant of an
 * existing name can be saved as a "different" product. Case variants are
 * blocked by the DB collation on the same rule.
 */
class ProductNameTest extends TestCase
{
    use TenancyHelpers;

    private function admin(): array
    {
        [$tenant, $branch] = $this->makeTenant('Store');

        return [$tenant, $branch, $this->makeUser($tenant, $branch, Role::Admin)];
    }

    private function createProduct(\App\Models\User $admin, string $name): array
    {
        $payload = [
            'name' => $name,
            'quantity' => 5,
            'cost_price' => 50,
            'selling_price' => 80,
        ];

        return [$this->actingAsUser($admin)->postJson('/api/products', $payload), $payload];
    }

    public function test_a_double_space_variant_of_an_existing_name_is_blocked(): void
    {
        [, , $admin] = $this->admin();

        $this->createProduct($admin, 'Coke 60cl')[0]->assertCreated();

        $this->createProduct($admin, 'Coke  60cl')[0]
            ->assertStatus(422)
            ->assertJsonValidationErrors('name');

        $this->assertSame(1, Product::where('name', 'Coke 60cl')->count());
    }

    public function test_a_double_space_variant_around_a_separator_is_blocked(): void
    {
        [, , $admin] = $this->admin();

        $this->createProduct($admin, 'Coke - 60cl')[0]->assertCreated();

        $this->createProduct($admin, 'Coke -  60cl')[0]
            ->assertStatus(422)
            ->assertJsonValidationErrors('name');
    }

    public function test_a_name_is_stored_trimmed_and_single_spaced(): void
    {
        [, , $admin] = $this->admin();

        $this->createProduct($admin, "  Coke   60cl  ")[0]->assertCreated();

        $this->assertSame('Coke 60cl', Product::query()->first()->name);
    }

    public function test_a_case_variant_of_an_existing_name_is_blocked(): void
    {
        [, , $admin] = $this->admin();

        $this->createProduct($admin, 'Coke 60cl')[0]->assertCreated();

        $this->createProduct($admin, 'COKE 60CL')[0]
            ->assertStatus(422)
            ->assertJsonValidationErrors('name');
    }

    public function test_renaming_a_product_to_a_double_space_variant_is_blocked(): void
    {
        [$tenant, , $admin] = $this->admin();

        $this->createProduct($admin, 'Coke 60cl')[0]->assertCreated();

        $product = Product::create([
            'tenant_id' => $tenant->id, 'name' => 'Pepsi 50cl',
            'quantity' => 5, 'cost_price' => 40, 'selling_price' => 70,
        ]);

        $this->actingAsUser($admin)
            ->putJson("/api/products/{$product->id}", [
                'name' => 'Coke  60cl',
                'cost_price' => 40,
                'selling_price' => 70,
            ])
            ->assertStatus(422)
            ->assertJsonValidationErrors('name');

        $this->assertSame('Pepsi 50cl', $product->fresh()->name);
    }

    // The legacy duplicate pairs share a name, so every edit of either one
    // used to die on "The name has already been taken" — including the
    // retire that resolves the pair. An unchanged name must not trip the
    // rule; only a rename onto a taken name does.
    public function test_a_legacy_duplicate_can_still_be_edited_and_retired(): void
    {
        [$tenant, , $admin] = $this->admin();

        // Two products sharing a name, exactly like the inherited pairs.
        $kept = Product::create([
            'tenant_id' => $tenant->id, 'name' => 'Legacy Dolo',
            'quantity' => 10, 'cost_price' => 50, 'selling_price' => 100,
        ]);
        $redundant = Product::create([
            'tenant_id' => $tenant->id, 'name' => 'Legacy Dolo',
            'quantity' => 3, 'cost_price' => 50, 'selling_price' => 100,
        ]);

        // Retire the redundant row — the save must go through.
        $this->actingAsUser($admin)
            ->putJson("/api/products/{$redundant->id}", [
                'name' => 'Legacy Dolo',
                'cost_price' => 50,
                'selling_price' => 100,
                'is_active' => false,
            ])
            ->assertOk();

        $this->assertFalse($redundant->fresh()->is_active);
        $this->assertTrue($kept->fresh()->is_active);

        // Renaming it onto the sibling's name is still blocked: the rule
        // applies whenever the name changes.
        $other = Product::create([
            'tenant_id' => $tenant->id, 'name' => 'Other Product',
            'quantity' => 5, 'cost_price' => 40, 'selling_price' => 70,
        ]);
        $this->actingAsUser($admin)
            ->putJson("/api/products/{$other->id}", [
                'name' => 'Legacy Dolo',
                'cost_price' => 40,
                'selling_price' => 70,
            ])
            ->assertStatus(422)
            ->assertJsonValidationErrors('name');
    }

    public function test_searching_with_stray_spaces_still_matches(): void
    {
        [, , $admin] = $this->admin();

        $this->createProduct($admin, 'Coke 60cl')[0]->assertCreated();

        $response = $this->actingAsUser($admin)
            ->getJson('/api/products?search='.rawurlencode('Coke  60cl'))
            ->assertOk();

        $this->assertSame('Coke 60cl', $response->json('data.0.name'));
    }
}