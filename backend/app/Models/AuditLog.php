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
        'subject_type', 'subject_id', 'subject_name', 'description',
        'properties', 'ip', 'created_at',
    ];

    protected $casts = [
        'properties' => 'array',
    ];

    /**
     * Human-readable labels for each recorded action — plain past-tense English
     * so the audit trail and its Excel export read as events, not developer
     * codes. Mirrors the frontend ActivityLog ACTION_META labels; keep both in
     * sync when an action is added. Unknown actions fall back to the raw code.
     */
    private const LABELS = [
        'auth.login' => 'Signed in',
        'auth.logout' => 'Signed out',
        'auth.password-change' => 'Password changed',
        'auth.password-reset' => 'Password reset',

        'product.created' => 'Product added',
        'product.updated' => 'Product updated',
        'product.deleted' => 'Product deleted',
        'product.imported' => 'Products imported',
        'consignment.created' => 'Stock received',
        'consignment.updated' => 'Stock receipt updated',
        'consignment.deleted' => 'Stock receipt deleted',

        'stock.received' => 'Stock received',
        'stock.write_off' => 'Stock written off',
        'stock.count' => 'Stock count',
        'stock.transfer' => 'Stock transfer',

        'sale_unit.created' => 'Sale unit added',
        'sale_unit.deleted' => 'Sale unit removed',

        'order.created' => 'Sale recorded',
        'order.voided' => 'Sale voided',

        'expense.created' => 'Expense added',
        'expense.updated' => 'Expense updated',
        'expense.deleted' => 'Expense deleted',
        'expense_category.created' => 'Expense category added',
        'expense_category.updated' => 'Expense category updated',
        'expense_category.deleted' => 'Expense category deleted',

        'user.created' => 'Employee added',
        'user.updated' => 'Employee updated',
        'device.created' => 'Device added',
        'device.updated' => 'Device updated',
        'device.deleted' => 'Device removed',

        'sync.received' => 'Sale synced in',
        'sync.pushed' => 'Sale synced out',
        'sync.voided' => 'Void synced in',
        'sync.failed' => 'Sync failed',
    ];

    public static function label(string $action): string
    {
        return self::LABELS[$action] ?? $action;
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    /**
     * Record an audit event. Resolves tenant/user from the auth context,
     * falling back to the subject's tenant. Never throws — a failed audit
     * entry must not break the request that triggered it.
     *
     * @param  string  $action       Dotted action code (see LABELS).
     * @param  object|null  $subject The model the event acts on.
     * @param  array  $properties    Structured before/after or context payload.
     * @param  string|null  $subjectName  Human name (defaults to subject's name/number).
     * @param  string|null  $description  One-line human summary of the event.
     */
    public static function record(string $action, $subject = null, array $properties = [], ?string $subjectName = null, ?string $description = null): ?self
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
                'subject_name' => $subjectName ?? self::resolveSubjectName($subject),
                'description' => $description,
                'properties' => $properties ?: null,
                'ip' => request()?->ip(),
            ]);
        } catch (\Throwable $e) {
            Log::warning('audit record failed', ['action' => $action, 'err' => $e->getMessage()]);

            return null;
        }
    }

    /**
     * Best-effort human name for a subject: prefer an explicit name/number
     * attribute, then fall back to "Type #id", then null for subject-less events.
     */
    private static function resolveSubjectName($subject): ?string
    {
        if ($subject === null) {
            return null;
        }

        if (isset($subject->name)) {
            return (string) $subject->name;
        }
        if (isset($subject->number)) {
            return (string) $subject->number;
        }

        return class_basename($subject).' #'.$subject->id;
    }

    /**
     * Insert-only. An audit row that already exists may never be re-saved —
     * that would be a silent edit of the trail.
     */
    public function save(array $options = []): bool
    {
        if ($this->exists) {
            throw new \RuntimeException('Audit logs are append-only.');
        }

        return parent::save($options);
    }

    public function update(array $attributes = [], array $options = []): bool
    {
        throw new \RuntimeException('Audit logs are append-only.');
    }

    public function delete(): bool
    {
        throw new \RuntimeException('Audit logs are append-only.');
    }

    public function forceDelete(): bool
    {
        throw new \RuntimeException('Audit logs are append-only.');
    }

    public function restore(): bool
    {
        throw new \RuntimeException('Audit logs are append-only.');
    }
};