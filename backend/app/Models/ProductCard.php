<?php

namespace App\Models;

use App\Traits\BelongsToTenant;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ProductCard extends Model
{
    use HasFactory, BelongsToTenant;

    protected $fillable = [
        'tenant_id', 'product_id', 'date',
        'opening', 'added', 'reversed', 'sold',
        'written_off', 'count_adj',
        'cost_price', 'selling_price', 'size',
        'user_id', 'legacy_id',
    ];

    protected $casts = [
        'date' => 'date',
        'opening' => 'decimal:4',
        'added' => 'decimal:4',
        'reversed' => 'decimal:4',
        'sold' => 'decimal:4',
        'written_off' => 'decimal:4',
        'count_adj' => 'decimal:4',
        'cost_price' => 'decimal:4',
        'selling_price' => 'decimal:4',
    ];

    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    /**
     * Closing stock = opening + added - sold + reversed - written_off + count_adj.
     * `reversed` restores voided stock; `written_off` removes it; `count_adj`
     * nets a physical count onto the day. This reconciles to products.quantity.
     */
    public function closing(): string
    {
        $closing = bcadd((string) $this->opening, (string) $this->added, 4);
        $closing = bcsub($closing, (string) $this->sold, 4);
        $closing = bcadd($closing, (string) $this->reversed, 4);
        $closing = bcsub($closing, (string) $this->written_off, 4);
        $closing = bcadd($closing, (string) $this->count_adj, 4);

        return $closing;
    }
}