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
        'cost_price', 'selling_price', 'size',
        'user_id', 'legacy_id',
    ];

    protected $casts = [
        'date' => 'date',
        'opening' => 'decimal:4',
        'added' => 'decimal:4',
        'reversed' => 'decimal:4',
        'sold' => 'decimal:4',
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

    /** Closing stock = opening + added - sold. */
    public function closing(): string
    {
        return bcsub(bcadd((string) $this->opening, (string) $this->added, 4), (string) $this->sold, 4);
    }
}