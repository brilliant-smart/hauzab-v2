<?php

namespace App\Models;

use App\Traits\BelongsToTenant;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Product extends Model
{
    use HasFactory, BelongsToTenant;

    protected $fillable = [
        'name', 'description', 'size', 'model', 'department',
        'category_id', 'unit_id', 'manufacturer_id', 'supplier_id',
        'quantity', 'cost_price', 'selling_price', 'reorder_level',
        'barcode', 'legacy_pid', 'image', 'manufacture_date', 'expire_date',
        'is_active', 'tenant_id',
    ];

    protected $casts = [
        'quantity' => 'decimal:4',
        'cost_price' => 'decimal:4',
        'selling_price' => 'decimal:4',
        'manufacture_date' => 'date',
        'expire_date' => 'date',
        'is_active' => 'boolean',
    ];

    public function tenant(): BelongsTo
    {
        return $this->belongsTo(Tenant::class);
    }

    public function category(): BelongsTo
    {
        return $this->belongsTo(ProductCategory::class, 'category_id');
    }

    public function unit(): BelongsTo
    {
        return $this->belongsTo(ProductUnit::class, 'unit_id');
    }

    public function manufacturer(): BelongsTo
    {
        return $this->belongsTo(ProductManufacturer::class, 'manufacturer_id');
    }

    public function supplier(): BelongsTo
    {
        return $this->belongsTo(ProductSupplier::class, 'supplier_id');
    }
}