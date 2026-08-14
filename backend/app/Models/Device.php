<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Device extends Model
{
    // A till/tablet at a branch. Sales are attributed to a device so that
    // offline-first append-only writes never conflict across devices.
    protected $fillable = ['tenant_id', 'branch_id', 'name', 'is_active', 'last_seen_at'];

    protected $casts = [
        'is_active' => 'boolean',
        'last_seen_at' => 'datetime',
    ];

    public function tenant(): BelongsTo
    {
        return $this->belongsTo(Tenant::class);
    }

    public function branch(): BelongsTo
    {
        return $this->belongsTo(Branch::class);
    }
}