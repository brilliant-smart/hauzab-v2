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