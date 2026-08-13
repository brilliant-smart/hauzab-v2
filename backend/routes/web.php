<?php

use Illuminate\Support\Facades\Route;

$serveSpa = function () {
    $path = public_path('index.html');

    return file_exists($path)
        ? response()->file($path)
        : response('Frontend not built. Run the frontend build and copy dist/ into backend/public/.', 503);
};

// Named login route so the auth middleware's default redirect resolves to the
// SPA login page instead of throwing "Route [login] not defined". API requests
// are still answered with 401 JSON (see shouldRenderJsonWhen in bootstrap/app.php).
Route::get('/login', $serveSpa)->name('login');

// Serve the built React SPA for any other non-API, non-file path; client-side
// routing handles the rest. API routes live under /api (routes/api.php).
Route::get('/{any}', $serveSpa)->where('any', '^(?!api|storage|build|assets|favicon\.ico|favicon\.svg).*$');

Route::get('/', $serveSpa);