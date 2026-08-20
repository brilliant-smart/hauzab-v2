import { User } from "./types";

export const isAuthenticated = (user: User | null) => !!user;

export const isAdmin = (user: User | null) => user?.role === "admin";

export const isSupervisor = (user: User | null) => user?.role === "supervisor";

export const isStaff = (user: User | null) => user?.role === "staff";

export const isInventoryManager = (user: User | null) =>
  user?.role === "inventory_manager";

export const isAtLeast = (user: User | null, role: User["role"]) => {
  const rank: Record<User["role"], number> = {
    admin: 3,
    supervisor: 2,
    staff: 1,
    inventory_manager: 0,
  };
  return !!user && rank[user.role] >= rank[role];
};

// Can manage the product catalog: admins, supervisors, and the products-only
// Inventory Manager role. Inventory Manager ranks 0 (outside the ladder), so it
// is added explicitly here rather than via isAtLeast.
export const canManageProducts = (user: User | null) =>
  !!user &&
  (user.role === "admin" ||
    user.role === "supervisor" ||
    user.role === "inventory_manager");

/** Front-line cashiers land on the register; managers land on the dashboard;
 *  the products-only Inventory Manager lands on the product list. */
export const homePathFor = (user: User | null) => {
  if (!user) return "/dashboard";
  if (user.role === "staff") return "/pos";
  if (user.role === "inventory_manager") return "/products";
  return "/dashboard";
};