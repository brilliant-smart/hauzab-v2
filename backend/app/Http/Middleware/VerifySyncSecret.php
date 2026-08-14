<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Guards the cloud receive endpoints. A request is accepted only if its
 * X-Sync-Secret header matches the configured secret in constant time. The
 * secret must be configured — a missing secret is a server fault, not a 403,
 * so misconfiguration is loud rather than silently rejecting every push.
 */
class VerifySyncSecret
{
    public function handle(Request $request, Closure $next): Response
    {
        $expected = (string) config('sync.secret');

        if ($expected === '') {
            abort(500, 'Sync secret is not configured.');
        }

        $given = (string) $request->header('X-Sync-Secret');

        if ($given === '' || ! hash_equals($expected, $given)) {
            abort(403, 'Invalid sync secret.');
        }

        return $next($request);
    }
}