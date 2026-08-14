<?php

namespace App\Models;

use App\Traits\BelongsToTenant;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class ExpenseCategory extends Model
{
    use HasFactory, BelongsToTenant;

    protected $fillable = [
        'tenant_id', 'name', 'description', 'legacy_pid',
    ];

    protected static function booted(): void
    {
        // Preserve the legacy invariant: category names are stored UPPERCASE.
        static::saving(function (self $category) {
            if ($category->isDirty('name') && $category->name !== null) {
                $category->name = strtoupper($category->name);
            }
        });
    }

    public function expenses(): HasMany
    {
        return $this->hasMany(Expense::class, 'expense_category_id');
    }
}