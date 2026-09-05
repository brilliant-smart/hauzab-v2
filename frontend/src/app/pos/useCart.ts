import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/app/auth/AuthContext";
import { Product } from "@/app/api/types";

/** One sellable unit option on a cart line (base unit + any carton/etc. units). */
export interface CartUnitOption {
  /** null = the product's base unit (factor 1). */
  unitId: number | null;
  name: string;
  factor: number;
  /** Price for one of this unit. */
  price: number;
}

export interface CartLine {
  productId: number;
  name: string;
  barcode?: string | null;
  /** Selected sale unit (null = base). Part of the dedup key with productId. */
  unitId: number | null;
  unitName: string;
  factor: number;
  /** Price per selected unit. */
  price: number;
  qty: number;
  /** Base units in stock (for the max-qty check: floor(stock / factor)). */
  stock: number;
  /** Base cost per single — the price floor is costPrice * factor. */
  costPrice: number;
  /** Every unit this product can be sold in, so the line is self-contained. */
  options: CartUnitOption[];
}

const storageKey = (tenantId?: number | null) => `hauzab:cart:${tenantId ?? "default"}`;

/** Build the unit options for a product: base first, then its sale units. */
function unitOptions(product: Product): CartUnitOption[] {
  const base: CartUnitOption = {
    unitId: null,
    name: product.unit?.name ?? "Piece",
    factor: 1,
    price: Number(product.selling_price),
  };
  const extras = (product.sale_units ?? []).map((su) => ({
    unitId: su.unit_id,
    name: su.unit?.name ?? "Unit",
    factor: Number(su.factor),
    price: Number(su.selling_price),
  }));
  return [base, ...extras];
}

function readCart(tenantId?: number | null): CartLine[] {
  try {
    const raw = localStorage.getItem(storageKey(tenantId));
    const parsed = raw ? (JSON.parse(raw) as CartLine[]) : [];
    // Drop any stale line missing the Phase 2 shape so an old cart never crashes
    // the picker — the cashier simply re-adds those products.
    return parsed.filter((l) => Array.isArray(l.options) && "unitId" in l);
  } catch {
    return [];
  }
}

/**
 * Client-side register cart. Lines survive a page refresh so a cashier never
 * loses an in-progress sale mid-shift. A product can be rung up in its base
 * unit or in any configured sale unit (e.g. a carton); the dedup key is
 * (productId, unitId) so singles and cartons of the same product coexist as
 * separate lines. Stock is validated at checkout.
 */
export function useCart() {
  const { user } = useAuth();
  const tenantId = user?.tenant_id;

  const [items, setItems] = useState<CartLine[]>(() => readCart(tenantId));

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
    const options = unitOptions(product);
    const base = options[0];
    setItems((prev) => {
      const existing = prev.find((l) => l.productId === product.id && l.unitId === null);
      if (existing) {
        return prev.map((l) =>
          l.productId === product.id && l.unitId === null ? { ...l, qty: l.qty + qty } : l,
        );
      }
      return [
        ...prev,
        {
          productId: product.id,
          name: product.name,
          barcode: product.barcode,
          unitId: null,
          unitName: base.name,
          factor: base.factor,
          price: base.price,
          qty,
          stock: Number(product.quantity),
          costPrice: Number(product.cost_price),
          options,
        },
      ];
    });
  }, []);

  const setQty = useCallback((productId: number, unitId: number | null, qty: number) => {
    setItems((prev) =>
      prev
        .map((l) =>
          l.productId === productId && l.unitId === unitId ? { ...l, qty: Math.max(0, qty) } : l,
        )
        .filter((l) => l.qty > 0),
    );
  }, []);

  const setPrice = useCallback((productId: number, unitId: number | null, price: number) => {
    setItems((prev) =>
      prev.map((l) =>
        l.productId === productId && l.unitId === unitId ? { ...l, price } : l,
      ),
    );
  }, []);

  /**
   * Switch a line's sale unit. If a line for the same product + target unit
   * already exists, merge the quantities into it (singles + more singles).
   */
  const setUnit = useCallback(
    (productId: number, unitId: number | null, targetUnitId: number | null) => {
      if (unitId === targetUnitId) return;
      setItems((prev) => {
        const idx = prev.findIndex(
          (l) => l.productId === productId && l.unitId === unitId,
        );
        if (idx === -1) return prev;
        const line = prev[idx];
        const opt = line.options.find((o) => o.unitId === targetUnitId) ?? line.options[0];
        const existingIdx = prev.findIndex(
          (l) => l.productId === productId && l.unitId === opt.unitId,
        );
        if (existingIdx !== -1 && existingIdx !== idx) {
          const merged = { ...prev[existingIdx], qty: prev[existingIdx].qty + line.qty };
          return prev.filter((_, i) => i !== idx && i !== existingIdx).concat(merged);
        }
        const copy = [...prev];
        copy[idx] = {
          ...line,
          unitId: opt.unitId,
          unitName: opt.name,
          factor: opt.factor,
          price: opt.price,
        };
        return copy;
      });
    },
    [],
  );

  const remove = useCallback((productId: number, unitId: number | null) => {
    setItems((prev) => prev.filter((l) => !(l.productId === productId && l.unitId === unitId)));
  }, []);

  const clear = useCallback(() => setItems([]), []);

  const subtotal = useMemo(
    () => items.reduce((sum, l) => sum + l.qty * l.price, 0),
    [items],
  );
  const count = useMemo(() => items.reduce((sum, l) => sum + l.qty, 0), [items]);

  return { items, add, setQty, setPrice, setUnit, remove, clear, subtotal, count };
}