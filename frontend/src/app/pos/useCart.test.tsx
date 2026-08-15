import { describe, it, expect, vi, beforeEach } from "vitest";
import { act } from "@testing-library/react";
import { useCart } from "@/app/pos/useCart";
import { renderHookWithProviders } from "@/test/setup";
import type { Product } from "@/app/api/types";

vi.mock("@/app/auth/AuthContext", () => ({
  AuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useAuth: () => ({ user: { id: 1, tenant_id: 1, role: "staff" }, token: "t", isAuthenticated: true, loading: false }),
}));

function product(overrides: Partial<Product> = {}): Product {
  return {
    id: 1,
    name: "Soda",
    quantity: "10",
    cost_price: "50",
    selling_price: "100",
    reorder_level: 0,
    is_active: true,
    ...overrides,
  };
}

beforeEach(() => {
  localStorage.clear();
});

describe("useCart", () => {
  it("starts empty", () => {
    const { result } = renderHookWithProviders(() => useCart());
    expect(result.current.items).toEqual([]);
    expect(result.current.count).toBe(0);
    expect(result.current.subtotal).toBe(0);
  });

  it("adds a new line and accumulates quantity for repeats", () => {
    const { result } = renderHookWithProviders(() => useCart());
    act(() => result.current.add(product()));
    act(() => result.current.add(product(), 2));
    expect(result.current.items).toHaveLength(1);
    expect(result.current.items[0].qty).toBe(3);
    expect(result.current.count).toBe(3);
    expect(result.current.subtotal).toBe(300);
  });

  it("sets quantity and drops a line when qty hits zero", () => {
    const { result } = renderHookWithProviders(() => useCart());
    act(() => result.current.add(product()));
    act(() => result.current.setQty(1, 0));
    expect(result.current.items).toEqual([]);
  });

  it("removes a specific line", () => {
    const { result } = renderHookWithProviders(() => useCart());
    act(() => result.current.add(product({ id: 1, name: "Soda" })));
    act(() => result.current.add(product({ id: 2, name: "Bread", selling_price: "40" })));
    act(() => result.current.remove(1));
    expect(result.current.items).toHaveLength(1);
    expect(result.current.items[0].name).toBe("Bread");
  });

  it("clears the cart", () => {
    const { result } = renderHookWithProviders(() => useCart());
    act(() => result.current.add(product()));
    act(() => result.current.clear());
    expect(result.current.items).toEqual([]);
  });

  it("persists lines to localStorage so a refresh keeps the sale", async () => {
    const { result } = renderHookWithProviders(() => useCart());
    act(() => result.current.add(product()));
    // The persist effect runs after the state commit.
    await Promise.resolve();
    await Promise.resolve();
    const raw = localStorage.getItem("hauzab:cart:1");
    expect(raw).not.toBeNull();
    expect(JSON.parse(raw!).at(-1).name).toBe("Soda");
  });
});