<?php

namespace App\Models;

use App\Traits\BelongsToTenant;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class UserProfile extends Model
{
    use HasFactory, BelongsToTenant;

    protected $fillable = [
        'fullname', 'gender', 'address', 'phone',
        'qualification', 'designation', 'state',
        'account_name', 'account_number', 'bank_name', 'salary',
        'tenant_id', 'user_id',
    ];

    protected $casts = [
        'salary' => 'decimal:2',
    ];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}