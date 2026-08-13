<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class UserResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'name' => $this->name,
            'email' => $this->email,
            'role' => $this->role?->value,
            'is_active' => $this->is_active,
            'tenant_id' => $this->tenant_id,
            'branch_id' => $this->branch_id,
            'branch' => $this->whenLoaded('branch', fn () => $this->branch?->only(['id', 'name'])),
            'profile' => $this->whenLoaded('profile', fn () => $this->profile?->only([
                'fullname', 'gender', 'address', 'phone',
                'qualification', 'designation', 'state',
                'account_name', 'account_number', 'bank_name', 'salary',
            ])),
            'created_at' => $this->created_at?->toIso8601String(),
        ];
    }
}