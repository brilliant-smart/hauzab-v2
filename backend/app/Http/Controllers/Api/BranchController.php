<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Branch;
use Illuminate\Http\Request;

class BranchController extends Controller
{
    /**
     * Active branches for the signed-in user's tenant. Used to populate the
     * branch select on the Devices admin screen. Branch does not carry the
     * BelongsToTenant trait, so the tenant filter is applied by hand.
     */
    public function index(Request $request)
    {
        $branches = Branch::query()
            ->where('tenant_id', $request->user()->tenant_id)
            ->where('is_active', true)
            ->orderBy('name')
            ->get(['id', 'name']);

        return response()->json(['data' => $branches]);
    }
}