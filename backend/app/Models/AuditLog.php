<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Log;

class AuditLog extends Model
{
    public $timestamps = false;

    // created_at only — this is an append-only event log.
    public const UPDATED_AT = null;

    protected $fillable = [
        'tenant_id', 'user_id', 'device_id', 'action',
        'subject_type', 'subject_id', 'properties', 'ip', 'created_at',
    ];

    protected $casts = [
        'properties' => 'array',
    ];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    /**
     * Record an audit event. Resolves tenant/user from the auth context,
     * falling back to the subject's tenant. Never throws — a failed audit
     * entry must not break the request that triggered it.
     */
    public static function record(string $action, $subject = null, array $properties = []): ?self
    {
        try {
            $user = Auth::user();

            return self::create([
                'tenant_id' => $user?->tenant_id ?? ($subject?->tenant_id ?? null),
                'user_id' => $user?->id,
                'device_id' => $subject?->device_id ?? null,
                'action' => $action,
                'subject_type' => $subject ? get_class($subject) : null,
                'subject_id' => $subject?->id ?? null,
                'properties' => $properties ?: null,
                'ip' => request()?->ip(),
            ]);
        } catch (\Throwable $e) {
            Log::warning('audit record failed', ['action' => $action, 'err' => $e->getMessage()]);
            return null;
        }
    }
}