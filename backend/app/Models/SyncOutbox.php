<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Facades\Config;

class SyncOutbox extends Model
{
    protected $table = 'sync_outbox';

    protected $fillable = [
        'tenant_id', 'kind', 'order_uuid', 'payload',
        'status', 'attempts', 'last_error', 'pushed_at',
    ];

    protected $casts = [
        'payload' => 'array',
        'pushed_at' => 'datetime',
    ];

    public function tenant(): BelongsTo
    {
        return $this->belongsTo(Tenant::class);
    }

    // Rows still worth retrying: pending and under the attempt cap.
    public function scopePending(Builder $query): Builder
    {
        return $query->where('status', 'pending')
            ->where('attempts', '<', (int) Config::get('sync.max_attempts', 5))
            ->orderBy('id');
    }
}