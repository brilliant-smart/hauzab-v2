<?php

namespace App\Enums;

enum OrderStatus: string
{
    case Pending = 'pending';
    case Completed = 'completed';
    case Voided = 'voided';
    case Credit = 'credit';

    public function label(): string
    {
        return match ($this) {
            self::Pending => 'Pending',
            self::Completed => 'Completed',
            self::Voided => 'Voided',
            self::Credit => 'Credit',
        };
    }
}