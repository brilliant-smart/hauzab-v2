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
    act(() => result.current.setQty(1, null, 0));
    expect(result.current.items).toEqual([]);
  });

  it("removes a specific line", () => {
    const { result } = renderHookWithProviders(() => useCart());
    act(() => result.current.add(product({ id: 1, name: "Soda" })));
    act(() => result.current.add(product({ id: 2, name: "Bread", selling_price: "40" })));
    act(() => result.current.remove(1, null));
    expect(result.current.items).toHaveLength(1);
    expect(result.current.items[0].name).toBe("Bread");
  });

  it("keeps base-unit and carton lines of one product as separate lines", () => {
    const { result } = renderHookWithProviders(() => useCart());
    // A product that sells as singles (base) and a carton of 12.
    const cartonProduct = product({
      id: 7,
      name: "Juice",
      quantity: "120",
      sale_units: [
        { id: 1, unit_id: 99, unit: { id: 99, name: "Carton" }, factor: "12", selling_price: "1100" },
      ],
    });
    // Scan the product (base line), then switch it to the carton — the line is
    // converted in place to a carton line (no base line remains yet).
    act(() => result.current.add(cartonProduct));
    act(() => result.current.setUnit(7, null, 99));
    expect(result.current.items).toHaveLength(1);
    expect(result.current.items[0].unitId).toBe(99);
    expect(result.current.items[0].factor).toBe(12);

    // Scan again — since no base line exists, a new base line is created and
    // now coexists with the carton line. The dedup key is (productId, unitId),
    // not just productId, so singles and cartons of one product stay separate.
    act(() => result.current.add(cartonProduct));
    expect(result.current.items).toHaveLength(2);
    expect(result.current.items.find((l) => l.unitId === null)?.factor).toBe(1);
    expect(result.current.items.find((l) => l.unitId === 99)?.factor).toBe(12);
    expect(result.current.count).toBe(2);

    // A third scan merges into the base line only — the carton line is
    // untouched.
    act(() => result.current.add(cartonProduct));
    expect(result.current.items).toHaveLength(2);
    expect(result.current.items.find((l) => l.unitId === null)?.qty).toBe(2);
    expect(result.current.items.find((l) => l.unitId === 99)?.qty).toBe(1);
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