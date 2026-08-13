import { User } from "./types";

export const isAuthenticated = (user: User | null) => !!user;

export const isAdmin = (user: User | null) => user?.role === "admin";

export const isSupervisor = (user: User | null) => user?.role === "supervisor";

export const isStaff = (user: User | null) => user?.role === "staff";

export const isAtLeast = (user: User | null, role: User["role"]) => {
  const rank: Record<User["role"], number> = {
    admin: 3,
    supervisor: 2,
    staff: 1,
  };
  return !!user && rank[user.role] >= rank[role];
};

/** Front-line cashiers land on the register; managers land on the dashboard. */
export const homePathFor = (user: User | null) =>
  user && user.role === "staff" ? "/pos" : "/dashboard";