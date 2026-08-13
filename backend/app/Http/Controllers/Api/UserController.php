<?php

namespace App\Http\Controllers\Api;

use App\Enums\Role;
use App\Http\Controllers\Controller;
use App\Http\Resources\UserResource;
use App\Models\User;
use App\Models\UserProfile;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

class UserController extends Controller
{
    public function index(Request $request)
    {
        $users = User::query()
            ->with(['branch', 'profile'])
            ->when($request->filled('search'), function ($q) use ($request) {
                $term = $request->string('search');
                $q->where(fn ($inner) => $inner
                    ->where('name', 'like', "%{$term}%")
                    ->orWhere('email', 'like', "%{$term}%"));
            })
            ->when($request->filled('role'), fn ($q) => $q->where('role', $request->string('role')))
            ->orderBy('name')
            ->paginate($request->integer('per_page', 25))
            ->withQueryString();

        return UserResource::collection($users)->response();
    }

    public function store(Request $request)
    {
        $data = $this->validated($request);

        $user = DB::transaction(function () use ($data, $request) {
            $user = User::create([
                'name' => $data['name'],
                'email' => $data['email'],
                'password' => $data['password'],
                'role' => $data['role'],
                'tenant_id' => $request->user()->tenant_id,
                'branch_id' => $data['branch_id'] ?? $request->user()->branch_id,
                'is_active' => $data['is_active'] ?? true,
            ]);

            $user->profile()->create(
                ['tenant_id' => $request->user()->tenant_id] + $this->profileData($data)
            );

            return $user;
        });

        return (new UserResource($user->load(['branch', 'profile'])))
            ->response()
            ->setStatusCode(201);
    }

    public function show(User $user)
    {
        return new UserResource($user->load(['branch', 'profile', 'tenant']));
    }

    public function update(Request $request, User $user)
    {
        $data = $this->validated($request, $user);

        DB::transaction(function () use ($data, $user) {
            $user->fill([
                'name' => $data['name'] ?? $user->name,
                'email' => $data['email'] ?? $user->email,
                'role' => $data['role'] ?? $user->role,
                'branch_id' => $data['branch_id'] ?? $user->branch_id,
                'is_active' => $data['is_active'] ?? $user->is_active,
            ]);

            if (filled($data['password'] ?? null)) {
                $user->password = $data['password'];
            }

            $user->save();
            $user->profile()->updateOrCreate(
                ['user_id' => $user->id],
                ['tenant_id' => $user->tenant_id] + $this->profileData($data)
            );
        });

        return new UserResource($user->load(['branch', 'profile']));
    }

    public function destroy(User $user)
    {
        if ($user->id === auth()->id()) {
            abort(422, 'You cannot delete your own account.');
        }

        $user->delete();

        return response()->json(['message' => 'Employee deleted']);
    }

    private function validated(Request $request, ?User $user = null): array
    {
        $tenantId = $request->user()->tenant_id;
        $isAdmin = $request->user()->isAdmin();

        return $request->validate([
            'name' => ['required', 'string', 'max:120'],
            'email' => ['required', 'email', 'max:120', Rule::unique('users')->where('tenant_id', $tenantId)->ignore($user?->id)],
            'password' => [$user ? 'nullable' : 'required', 'string', 'min:6', 'max:120'],
            'role' => ['required', 'string', Rule::in(array_column(Role::cases(), 'value')),
                // Supervisors can only manage staff; admins can assign any role.
                function ($attribute, $value, $fail) use ($isAdmin) {
                    if (! $isAdmin && $value !== Role::Staff->value) {
                        $fail('Only administrators can assign that role.');
                    }
                },
            ],
            'branch_id' => ['nullable', 'integer', 'exists:branches,id'],
            'is_active' => ['boolean'],

            'fullname' => ['nullable', 'string', 'max:120'],
            'gender' => ['nullable', 'string', 'max:15'],
            'address' => ['nullable', 'string', 'max:255'],
            'phone' => ['nullable', 'string', 'max:20'],
            'qualification' => ['nullable', 'string', 'max:120'],
            'designation' => ['nullable', 'string', 'max:120'],
            'state' => ['nullable', 'string', 'max:120'],
            'account_name' => ['nullable', 'string', 'max:120'],
            'account_number' => ['nullable', 'string', 'max:30'],
            'bank_name' => ['nullable', 'string', 'max:120'],
            'salary' => ['nullable', 'numeric', 'min:0'],
        ]);
    }

    private function profileData(array $data): array
    {
        return array_filter([
            'fullname' => $data['fullname'] ?? null,
            'gender' => $data['gender'] ?? null,
            'address' => $data['address'] ?? null,
            'phone' => $data['phone'] ?? null,
            'qualification' => $data['qualification'] ?? null,
            'designation' => $data['designation'] ?? null,
            'state' => $data['state'] ?? null,
            'account_name' => $data['account_name'] ?? null,
            'account_number' => $data['account_number'] ?? null,
            'bank_name' => $data['bank_name'] ?? null,
            'salary' => $data['salary'] ?? null,
        ], fn ($v) => filled($v));
    }
}