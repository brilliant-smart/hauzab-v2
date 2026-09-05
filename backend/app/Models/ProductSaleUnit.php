<?php

namespace App\Models;

use App\Traits\BelongsToTenant;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * A non-base sale unit for a product (e.g. a Carton of 24 singles). Stock is
 * held in the product's base unit; a sale unit carries a factor (base units
 * per sale unit) and its own selling price so the POS can ring up "1 Carton"
 * while the ledger decrements 24 base units.
 */
class ProductSaleUnit extends Model
{
    use BelongsToTenant;

    protected $fillable = [
        'tenant_id', 'product_id', 'unit_id',
        'factor', 'selling_price',
    ];

    protected $casts = [
        'factor' => 'decimal:4',
        'selling_price' => 'decimal:4',
    ];

    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class);
    }

    public function unit(): BelongsTo
    {
        return $this->belongsTo(ProductUnit::class);
    }
}