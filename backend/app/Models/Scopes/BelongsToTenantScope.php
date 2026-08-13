<?php

namespace App\Models\Scopes;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Scope;
use Illuminate\Support\Facades\Auth;

/**
 * Global scope that restricts queries to the authenticated user's tenant.
 *
 * Resolves the active tenant from the logged-in user. When there is no
 * authenticated user (console, seeding, the login request itself) the scope
 * is a no-op so bootstrapping and tenant-agnostic queries still work.
 */
class BelongsToTenantScope implements Scope
{
    public function apply(Builder $builder, Model $model): void
    {
        $user = Auth::user();

        if (! $user || ! $user->tenant_id) {
            return;
        }

        $builder->where($model->getTable() . '.tenant_id', $user->tenant_id);
    }
}