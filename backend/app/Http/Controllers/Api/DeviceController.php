<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Device;
use Illuminate\Http\Request;

class DeviceController extends Controller
{
    public function index(Request $request)
    {
        $devices = Device::query()
            ->with('branch:id,name')
            ->where('tenant_id', $request->user()->tenant_id)
            ->orderByDesc('last_seen_at')
            ->orderBy('name')
            ->get();

        return response()->json(['data' => $devices]);
    }

    public function store(Request $request)
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:120'],
            'branch_id' => ['nullable', 'integer', 'exists:branches,id'],
            'is_active' => ['nullable', 'boolean'],
        ]);

        $device = Device::create([
            'tenant_id' => $request->user()->tenant_id,
            'branch_id' => $data['branch_id'] ?? null,
            'name' => $data['name'],
            'is_active' => $data['is_active'] ?? true,
        ]);

        return response()->json(['data' => $device], 201);
    }
}