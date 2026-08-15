import { describe, it, expect } from "vitest";
import { isAdmin, isAtLeast, isAuthenticated, isStaff, isSupervisor, homePathFor } from "@/app/auth/guards";
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
  it("isAdmin/isSupervisor/isStaff match the exact role", () => {
    expect(isAdmin(user("admin"))).toBe(true);
    expect(isAdmin(user("staff"))).toBe(false);
    expect(isSupervisor(user("supervisor"))).toBe(true);
    expect(isStaff(user("staff"))).toBe(true);
    expect(isAdmin(null)).toBe(false);
  });
});

describe("isAtLeast", () => {
  it("ranks admin > supervisor > staff", () => {
    expect(isAtLeast(user("admin"), "admin")).toBe(true);
    expect(isAtLeast(user("supervisor"), "admin")).toBe(false);
    expect(isAtLeast(user("supervisor"), "supervisor")).toBe(true);
    expect(isAtLeast(user("admin"), "staff")).toBe(true);
    expect(isAtLeast(user("staff"), "supervisor")).toBe(false);
    expect(isAtLeast(null, "staff")).toBe(false);
  });
});

describe("homePathFor", () => {
  it("sends cashiers to the register and managers to the dashboard", () => {
    expect(homePathFor(user("staff"))).toBe("/pos");
    expect(homePathFor(user("supervisor"))).toBe("/dashboard");
    expect(homePathFor(user("admin"))).toBe("/dashboard");
    expect(homePathFor(null)).toBe("/dashboard");
  });
});