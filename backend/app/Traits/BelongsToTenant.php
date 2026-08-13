<?php

namespace App\Traits;

use App\Models\Scopes\BelongsToTenantScope;

/**
 * Apply to any tenant-scoped model. Adds tenant_id to fillable, validates
 * the column exists, and registers the BelongsToTenantScope global scope so
 * every query is automatically constrained to the current user's tenant.
 */
trait BelongsToTenant
{
    public static function bootBelongsToTenant(): void
    {
        static::addGlobalScope(new BelongsToTenantScope());
    }
}