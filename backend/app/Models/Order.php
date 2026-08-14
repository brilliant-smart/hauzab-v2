<?php

namespace App\Models;

use App\Enums\OrderStatus;
use App\Traits\BelongsToTenant;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Order extends Model
{
    use HasFactory, BelongsToTenant;

    protected $fillable = [
        'tenant_id', 'branch_id', 'device_id', 'user_id',
        'number', 'uuid', 'legacy_number',
        'subtotal', 'discount', 'total', 'amount_paid', 'change',
        'status', 'customer_id', 'customer_name', 'customer_phone', 'note',
        'legacy_meta',
    ];

    protected $casts = [
        'subtotal' => 'decimal:4',
        'discount' => 'decimal:4',
        'total' => 'decimal:4',
        'amount_paid' => 'decimal:4',
        'change' => 'decimal:4',
        'status' => OrderStatus::class,
        'legacy_meta' => 'array',
    ];

    public function tenant(): BelongsTo
    {
        return $this->belongsTo(Tenant::class);
    }

    public function branch(): BelongsTo
    {
        return $this->belongsTo(Branch::class);
    }

    public function device(): BelongsTo
    {
        return $this->belongsTo(Device::class);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
    }

    public function items(): HasMany
    {
        return $this->hasMany(OrderItem::class);
    }

    public function payments(): HasMany
    {
        return $this->hasMany(Payment::class);
    }
}