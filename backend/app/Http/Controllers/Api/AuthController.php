<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Models\Device;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Validation\ValidationException;

class AuthController extends Controller
{
    /**
     * Authenticate a user and issue a Sanctum token. Single-session: any
     * previously issued tokens are revoked on a new login.
     */
    public function login(Request $request): JsonResponse
    {
        $credentials = $request->validate([
            'email' => ['required', 'email'],
            'password' => ['required', 'string'],
            'device_name' => ['nullable', 'string', 'max:120'],
            'device_id' => ['nullable', 'integer'],
        ]);

        if (! Auth::guard('web')->attempt($request->only('email', 'password'))) {
            throw ValidationException::withMessages([
                'email' => [trans('auth.failed')],
            ]);
        }

        $user = Auth::guard('web')->user();

        if (! $user->canLogin()) {
            Auth::guard('web')->logout();
            throw ValidationException::withMessages([
                'email' => ['This account is disabled. Contact an administrator.'],
            ]);
        }

        // Stamp the till's last-seen so admins can spot dormant devices. The
        // device must belong to the same tenant — a wrong tenant id is ignored
        // rather than failing the login.
        $deviceId = $request->integer('device_id');
        if ($deviceId && Device::where('id', $deviceId)->where('tenant_id', $user->tenant_id)->exists()) {
            Device::where('id', $deviceId)->update(['last_seen_at' => now()]);
        }

        // Single active session per user.
        $user->tokens()->delete();

        $token = $user->createToken(
            $request->input('device_name', 'api-token')
        );

        AuditLog::record('auth.login', $user);

        return response()->json([
            'token' => $token->plainTextToken,
            'user' => $this->userPayload($user),
        ]);
    }

    public function logout(Request $request): JsonResponse
    {
        $user = $request->user();
        $user?->currentAccessToken()?->delete();

        AuditLog::record('auth.logout', $user);

        return response()->json(['message' => 'Logged out']);
    }

    public function me(Request $request): JsonResponse
    {
        return response()->json([
            'user' => $this->userPayload($request->user()),
        ]);
    }

    private function userPayload($user): array
    {
        return [
            'id' => $user->id,
            'name' => $user->name,
            'email' => $user->email,
            'role' => $user->role?->value,
            'tenant_id' => $user->tenant_id,
            'branch_id' => $user->branch_id,
            'tenant' => $user->tenant?->only(['id', 'name', 'slug']),
            'branch' => $user->branch?->only(['id', 'name']),
        ];
    }
}