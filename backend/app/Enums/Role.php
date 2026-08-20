<?php

namespace App\Enums;

// Staff roles within a tenant. Admin/supervisor/staff form a privilege ladder
// (admin > supervisor > staff). Inventory Manager is a scoped role outside the
// ladder — it manages the product catalog only and inherits nothing by rank, so
// all of its access is granted by explicit route/nav allow-lists, not by rank.
// Replaces the old Hauzab `type` int column whose supervisor/manager
// helpers were inverted (isSupervisor matched admin, isManager matched both).
enum Role: string
{
    case Admin = 'admin';
    case Supervisor = 'supervisor';
    case Staff = 'staff';
    case InventoryManager = 'inventory_manager';

    public function label(): string
    {
        return match ($this) {
            self::Admin => 'Administrator',
            self::Supervisor => 'Supervisor',
            self::Staff => 'Staff',
            self::InventoryManager => 'Inventory Manager',
        };
    }

    /** Privilege rank for comparison (admin > supervisor > staff). Inventory
     *  Manager ranks 0 so it never passes isAtLeast() for any ladder role —
     *  its permissions come from explicit allow-lists, not rank. */
    public function rank(): int
    {
        return match ($this) {
            self::Admin => 3,
            self::Supervisor => 2,
            self::Staff => 1,
            self::InventoryManager => 0,
        };
    }

    public function can(self $other): bool
    {
        return $this->rank() >= $other->rank();
    }
}