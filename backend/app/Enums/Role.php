<?php

namespace App\Enums;

// Staff roles within a tenant. Ordered by privilege.
// Replaces the old Hauzab `type` int column whose supervisor/manager
// helpers were inverted (isSupervisor matched admin, isManager matched both).
enum Role: string
{
    case Admin = 'admin';
    case Supervisor = 'supervisor';
    case Staff = 'staff';

    public function label(): string
    {
        return match ($this) {
            self::Admin => 'Administrator',
            self::Supervisor => 'Supervisor',
            self::Staff => 'Staff',
        };
    }

    /** Privilege rank for comparison (admin > supervisor > staff). */
    public function rank(): int
    {
        return match ($this) {
            self::Admin => 3,
            self::Supervisor => 2,
            self::Staff => 1,
        };
    }

    public function can(self $other): bool
    {
        return $this->rank() >= $other->rank();
    }
}