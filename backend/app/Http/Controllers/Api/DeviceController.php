<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Models\Device;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

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
        $data = $this->validated($request);

        $device = Device::create([
            'tenant_id' => $request->user()->tenant_id,
            'branch_id' => $data['branch_id'] ?? null,
            'name' => $data['name'],
            'is_active' => $data['is_active'] ?? true,
        ]);

        DB::afterCommit(fn () => AuditLog::record('device.created', $device));

        return response()->json(['data' => $device->fresh()], 201);
    }

    public function show(Request $request, int $id)
    {
        return response()->json(['data' => $this->scoped($request, $id)]);
    }

    public function update(Request $request, int $id)
    {
        $device = $this->scoped($request, $id);
        $data = $this->validated($request);

        $device->fill([
            'name' => $data['name'] ?? $device->name,
            'branch_id' => array_key_exists('branch_id', $data) ? $data['branch_id'] : $device->branch_id,
            'is_active' => $data['is_active'] ?? $device->is_active,
        ])->save();

        DB::afterCommit(fn () => AuditLog::record('device.updated', $device));

        return response()->json(['data' => $device->fresh()]);
    }

    public function destroy(Request $request, int $id)
    {
        $device = $this->scoped($request, $id);
        $device->delete();

        DB::afterCommit(fn () => AuditLog::record('device.deleted', $device));

        return response()->json(['message' => 'Device deleted']);
    }

    /**
     * Device has no BelongsToTenant global scope, so resolve by id within the
     * signed-in user's tenant and 404 otherwise.
     */
    private function scoped(Request $request, int $id): Device
    {
        return Device::where('tenant_id', $request->user()->tenant_id)
            ->where('id', $id)
            ->firstOrFail();
    }

    private function validated(Request $request): array
    {
        return $request->validate([
            'name' => ['sometimes', 'required', 'string', 'max:120'],
            'branch_id' => ['sometimes', 'nullable', 'integer', 'exists:branches,id'],
            'is_active' => ['sometimes', 'boolean'],
        ]);
    }
}