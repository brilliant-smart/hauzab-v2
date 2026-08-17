<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Models\Device;
use App\Models\User;
use App\Models\UserProfile;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Password;
use Illuminate\Validation\Rule;
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

    /**
     * Email a password-reset link. Uses Laravel's password broker, which
     * stores a hashed random token in password_reset_tokens and dispatches
     * the user's sendPasswordResetNotification (our SPA-link notification).
     */
    public function forgotPassword(Request $request): JsonResponse
    {
        $request->validate(['email' => ['required', 'email']]);

        $status = Password::sendResetLink(
            $request->only('email')
        );

        // Always respond 200 with a generic message so the endpoint can't be
        // used to enumerate which emails have accounts.
        if ($status === Password::RESET_LINK_SENT) {
            return response()->json(['message' => 'If that email is registered, a reset link has been sent.']);
        }

        return response()->json(['message' => 'If that email is registered, a reset link has been sent.']);
    }

    /**
     * Reset a password using a broker token. On success, revoke every token
     * so the password change forces a fresh login on all devices.
     */
    public function resetPassword(Request $request): JsonResponse
    {
        $request->validate([
            'token' => ['required', 'string'],
            'email' => ['required', 'email'],
            'password' => ['required', 'string', 'min:8', 'confirmed'],
        ]);

        $status = Password::reset(
            $request->only('email', 'password', 'password_confirmation', 'token'),
            function (User $user, string $password) {
                $user->password = $password;
                $user->save();
                $user->tokens()->delete();

                DB::afterCommit(fn () => AuditLog::record('auth.password-reset', $user));
            }
        );

        if ($status === Password::PASSWORD_RESET) {
            return response()->json(['message' => 'Your password has been reset.']);
        }

        throw ValidationException::withMessages([
            'email' => [trans($status)],
        ]);
    }

    /**
     * Change the signed-in user's password. Requires the current password;
     * revokes all other sessions on success.
     */
    public function changePassword(Request $request): JsonResponse
    {
        $request->validate([
            'current_password' => ['required', 'string'],
            'new_password' => ['required', 'string', 'min:8', 'different:current_password'],
        ]);

        $user = $request->user();

        if (! Hash::check($request->current_password, $user->password)) {
            throw ValidationException::withMessages([
                'current_password' => ['The current password is incorrect.'],
            ]);
        }

        $user->password = $request->new_password;
        $user->save();

        // Keep the current token, drop any others.
        $user->tokens()->where('id', '!=', $user->currentAccessToken()->id)->delete();

        DB::afterCommit(fn () => AuditLog::record('auth.password-change', $user));

        return response()->json(['message' => 'Password updated.']);
    }

    /**
     * The signed-in user's profile (account + employee/profile details).
     */
    public function showProfile(Request $request): JsonResponse
    {
        $user = $request->user();

        return response()->json([
            'user' => $this->userPayload($user),
            'profile' => $user->profile ?: new UserProfile(['user_id' => $user->id]),
        ]);
    }

    /**
     * Update the signed-in user's editable account fields + employee profile.
     * Password is changed through the dedicated change-password endpoint.
     */
    public function updateProfile(Request $request): JsonResponse
    {
        $user = $request->user();
        $tenantId = $user->tenant_id;

        $data = $request->validate([
            'name' => ['required', 'string', 'max:191'],
            'email' => ['required', 'email', 'max:191', Rule::unique('users', 'email')->ignore($user->id)],
            'profile' => ['nullable', 'array'],
            'profile.fullname' => ['nullable', 'string', 'max:191'],
            'profile.gender' => ['nullable', 'string', 'max:30'],
            'profile.address' => ['nullable', 'string', 'max:191'],
            'profile.phone' => ['nullable', 'string', 'max:30'],
            'profile.qualification' => ['nullable', 'string', 'max:120'],
            'profile.designation' => ['nullable', 'string', 'max:120'],
            'profile.state' => ['nullable', 'string', 'max:120'],
            'profile.account_name' => ['nullable', 'string', 'max:191'],
            'profile.account_number' => ['nullable', 'string', 'max:30'],
            'profile.bank_name' => ['nullable', 'string', 'max:120'],
            'profile.salary' => ['nullable', 'numeric', 'min:0'],
        ]);

        $user->fill($request->only('name', 'email'))->save();

        if (isset($data['profile'])) {
            $profile = $user->profile ?: (new UserProfile(['user_id' => $user->id, 'tenant_id' => $tenantId]));
            $profile->fill($data['profile'])->save();
        }

        return response()->json([
            'user' => $this->userPayload($user->fresh()),
            'profile' => $user->fresh()->profile ?: new UserProfile(['user_id' => $user->id]),
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