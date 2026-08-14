<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use Illuminate\Http\Request;

class AuditLogController extends Controller
{
    public function index(Request $request)
    {
        $logs = AuditLog::query()
            ->with(['user'])
            ->when($request->filled('action'), fn ($q) => $q->where('action', $request->string('action')))
            ->when($request->filled('search'), function ($q) use ($request) {
                $term = $request->string('search');
                $q->where(fn ($inner) => $inner
                    ->where('action', 'like', "%{$term}%")
                    ->orWhere('subject_type', 'like', "%{$term}%")
                    ->orWhereHas('user', fn ($u) => $u->where('name', 'like', "%{$term}%")));
            })
            ->latest('created_at')
            ->paginate($request->integer('per_page', 25))
            ->withQueryString();

        return response()->json($logs);
    }
}