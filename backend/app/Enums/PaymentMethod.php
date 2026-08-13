<?php

namespace App\Enums;

// Tender methods carried over from the old Hauzab register.
// "POS" is the card-terminal term Nigerian staff already use.
enum PaymentMethod: string
{
    case Cash = 'cash';
    case Pos = 'pos';
    case Transfer = 'transfer';

    public function label(): string
    {
        return match ($this) {
            self::Cash => 'Cash',
            self::Pos => 'POS',
            self::Transfer => 'Transfer',
        };
    }
}