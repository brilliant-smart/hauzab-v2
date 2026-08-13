<?php

namespace App\Http\Middleware;

use App\Enums\Role;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Restrict a route to one or more roles. Roles are passed as a pipe-separated
 * list in the alias, e.g. ->middleware('role:admin|supervisor'). An
 * unauthenticated request is left for the auth middleware to reject.
 */
class RequireRole
{
    public function handle(Request $request, Closure $next, string $roles): Response
    {
        $user = $request->user();

        if (! $user) {
            return $next($request);
        }

        $allowed = array_map(fn (string $r) => Role::from(trim($r)), explode('|', $roles));

        if (! in_array($user->role, $allowed, true)) {
            abort(403, 'You are not authorized to perform this action.');
        }

        return $next($request);
    }
}