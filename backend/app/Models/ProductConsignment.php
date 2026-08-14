<?php

namespace App\Models;

use App\Traits\BelongsToTenant;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ProductConsignment extends Model
{
    use HasFactory, BelongsToTenant;

    protected $fillable = [
        'tenant_id', 'name', 'description', 'model', 'size', 'department',
        'category', 'category_id',
        'quantity', 'unit_cost', 'unit_price', 'unit_profit',
        'image', 'consignment',
        'manufacture_date', 'expire_date', 'date',
        'barcode', 'user_id', 'legacy_id',
    ];

    protected $casts = [
        'quantity' => 'decimal:4',
        'unit_cost' => 'decimal:4',
        'unit_price' => 'decimal:4',
        'unit_profit' => 'decimal:4',
        'manufacture_date' => 'date',
        'expire_date' => 'date',
        'date' => 'date',
    ];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function category(): BelongsTo
    {
        return $this->belongsTo(ProductCategory::class, 'category_id');
    }
}