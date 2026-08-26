<?php

namespace App\Models;

use App\Traits\BelongsToTenant;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Append-only authoritative stock ledger. Every base-unit stock change for a
 * product — sale, void, receive, write-off, count, (Phase 2: transfer) — is one
 * immutable row here. Together with product_cards it lets an auditor reconcile
 * products.quantity at any point without replaying sales.
 *
 * Never update or delete a row: the model refuses it. Corrections are new rows
 * (e.g. a recount writes a new stock.count row, not an edit of an old one).
 */
class StockMovement extends Model
{
    use BelongsToTenant;

    public const UPDATED_AT = null;

    protected $fillable = [
        'tenant_id', 'product_id', 'user_id',
        'type', 'delta', 'quantity_before', 'quantity_after',
        'unit_id', 'factor',
        'reference_type', 'reference_id',
        'reason', 'note',
        'created_at',
    ];

    protected $casts = [
        'delta' => 'decimal:4',
        'quantity_before' => 'decimal:4',
        'quantity_after' => 'decimal:4',
        'factor' => 'decimal:4',
        'created_at' => 'datetime',
    ];

    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function unit(): BelongsTo
    {
        return $this->belongsTo(ProductUnit::class);
    }

    /**
     * Insert-only. A movement that already exists in the database may never be
     * re-saved — that would be a silent edit of the audit trail.
     */
    public function save(array $options = []): bool
    {
        if ($this->exists) {
            throw new \RuntimeException('Stock movements are append-only.');
        }

        return parent::save($options);
    }

    public function update(array $attributes = [], array $options = []): bool
    {
        throw new \RuntimeException('Stock movements are append-only.');
    }

    public function delete(): bool
    {
        throw new \RuntimeException('Stock movements are append-only.');
    }

    public function forceDelete(): bool
    {
        throw new \RuntimeException('Stock movements are append-only.');
    }

    public function restore(): bool
    {
        throw new \RuntimeException('Stock movements are append-only.');
    }
};