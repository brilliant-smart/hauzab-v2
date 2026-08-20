import { describe, it, expect } from "vitest";
import {
  canManageProducts,
  isAdmin,
  isAtLeast,
  isAuthenticated,
  isInventoryManager,
  isStaff,
  isSupervisor,
  homePathFor,
} from "@/app/auth/guards";
import type { User } from "@/app/auth/types";

const user = (role: User["role"]): User => ({
  id: 1,
  name: "Test",
  email: "t@example.com",
  role,
});

describe("isAuthenticated", () => {
  it("is true when a user exists", () => {
    expect(isAuthenticated(user("staff"))).toBe(true);
    expect(isAuthenticated(null)).toBe(false);
  });
});

describe("role predicates", () => {
  it("isAdmin/isSupervisor/isStaff/isInventoryManager match the exact role", () => {
    expect(isAdmin(user("admin"))).toBe(true);
    expect(isAdmin(user("staff"))).toBe(false);
    expect(isSupervisor(user("supervisor"))).toBe(true);
    expect(isStaff(user("staff"))).toBe(true);
    expect(isInventoryManager(user("inventory_manager"))).toBe(true);
    expect(isInventoryManager(user("supervisor"))).toBe(false);
    expect(isAdmin(null)).toBe(false);
  });
});

describe("isAtLeast", () => {
  it("ranks admin > supervisor > staff, with inventory_manager below all", () => {
    expect(isAtLeast(user("admin"), "admin")).toBe(true);
    expect(isAtLeast(user("supervisor"), "admin")).toBe(false);
    expect(isAtLeast(user("supervisor"), "supervisor")).toBe(true);
    expect(isAtLeast(user("admin"), "staff")).toBe(true);
    expect(isAtLeast(user("staff"), "supervisor")).toBe(false);
    expect(isAtLeast(null, "staff")).toBe(false);
    // Inventory Manager ranks 0 — outside the ladder, below even staff, so it
    // never passes isAtLeast for any ladder role (its access is opt-in only).
    expect(isAtLeast(user("inventory_manager"), "staff")).toBe(false);
    expect(isAtLeast(user("inventory_manager"), "supervisor")).toBe(false);
    expect(isAtLeast(user("admin"), "inventory_manager")).toBe(true);
  });
});

describe("canManageProducts", () => {
  it("allows admin, supervisor, and inventory_manager; denies staff", () => {
    expect(canManageProducts(user("admin"))).toBe(true);
    expect(canManageProducts(user("supervisor"))).toBe(true);
    expect(canManageProducts(user("inventory_manager"))).toBe(true);
    expect(canManageProducts(user("staff"))).toBe(false);
    expect(canManageProducts(null)).toBe(false);
  });
});

describe("homePathFor", () => {
  it("sends cashiers to the register, managers to the dashboard, inventory to products", () => {
    expect(homePathFor(user("staff"))).toBe("/pos");
    expect(homePathFor(user("supervisor"))).toBe("/dashboard");
    expect(homePathFor(user("admin"))).toBe("/dashboard");
    expect(homePathFor(user("inventory_manager"))).toBe("/products");
    expect(homePathFor(null)).toBe("/dashboard");
  });
});