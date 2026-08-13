import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/app/auth/AuthContext";
import { Product } from "@/app/api/types";

export interface CartLine {
  productId: number;
  name: string;
  barcode?: string | null;
  price: number;
  qty: number;
  stock: number;
  costPrice: number;
}

const storageKey = (tenantId?: number | null) => `hauzab:cart:${tenantId ?? "default"}`;

function readCart(tenantId?: number | null): CartLine[] {
  try {
    const raw = localStorage.getItem(storageKey(tenantId));
    return raw ? (JSON.parse(raw) as CartLine[]) : [];
  } catch {
    return [];
  }
}

/**
 * Client-side register cart. Lines survive a page refresh so a cashier never
 * loses an in-progress sale mid-shift. There is no per-add round-trip to the
 * server; stock is validated at checkout.
 */
export function useCart() {
  const { user } = useAuth();
  const tenantId = user?.tenant_id;

  const [items, setItems] = useState<CartLine[]>(() => readCart(tenantId));

  // Reload from storage if the signed-in tenant changes.
  useEffect(() => {
    setItems(readCart(tenantId));
  }, [tenantId]);

  useEffect(() => {
    try {
      localStorage.setItem(storageKey(tenantId), JSON.stringify(items));
    } catch {
      // ignore quota / private-mode errors
    }
  }, [items, tenantId]);

  const add = useCallback((product: Product, qty = 1) => {
    setItems((prev) => {
      const existing = prev.find((l) => l.productId === product.id);
      if (existing) {
        return prev.map((l) =>
          l.productId === product.id ? { ...l, qty: l.qty + qty } : l,
        );
      }
      return [
        ...prev,
        {
          productId: product.id,
          name: product.name,
          barcode: product.barcode,
          price: Number(product.selling_price),
          qty,
          stock: Number(product.quantity),
          costPrice: Number(product.cost_price),
        },
      ];
    });
  }, []);

  const setQty = useCallback((productId: number, qty: number) => {
    setItems((prev) =>
      prev
        .map((l) => (l.productId === productId ? { ...l, qty: Math.max(0, qty) } : l))
        .filter((l) => l.qty > 0),
    );
  }, []);

  const setPrice = useCallback((productId: number, price: number) => {
    setItems((prev) =>
      prev.map((l) => (l.productId === productId ? { ...l, price } : l)),
    );
  }, []);

  const remove = useCallback((productId: number) => {
    setItems((prev) => prev.filter((l) => l.productId !== productId));
  }, []);

  const clear = useCallback(() => setItems([]), []);

  const subtotal = useMemo(
    () => items.reduce((sum, l) => sum + l.qty * l.price, 0),
    [items],
  );
  const count = useMemo(() => items.reduce((sum, l) => sum + l.qty, 0), [items]);

  return { items, add, setQty, setPrice, remove, clear, subtotal, count };
}