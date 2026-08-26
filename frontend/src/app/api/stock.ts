import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/app/lib/api";
import { downloadExport } from "@/app/lib/exportDownload";
import { Paginated, Product, StockMovement } from "./types";

export const stockKeys = {
  all: ["stock-movements"] as const,
  list: (params: Record<string, unknown>) => ["stock-movements", "list", params] as const,
};

/** Paginated, filterable stock-movements ledger (type, product, date, search). */
export function useStockMovements(params: Record<string, unknown> = {}) {
  return useQuery({
    queryKey: stockKeys.list(params),
    queryFn: async () => {
      const { data } = await api.get<Paginated<StockMovement>>("stock-movements", { params });
      return data;
    },
    placeholderData: keepPreviousData,
  });
}

/** Record a stock-received (stock-in) movement for a product. */
export function useStockReceived() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { product: Product; quantity: number; reason?: string; note?: string }) => {
      const { data } = await api.post<{ data: StockMovement }>(
        `products/${vars.product.id}/stock-received`,
        { quantity: vars.quantity, reason: vars.reason ?? null, note: vars.note ?? null },
      );
      return data.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: stockKeys.all }),
  });
}

/** Record a write-off (stock-out) movement for a product. */
export function useWriteOff() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { product: Product; quantity: number; reason?: string; note?: string }) => {
      const { data } = await api.post<{ data: StockMovement }>(
        `products/${vars.product.id}/write-off`,
        { quantity: vars.quantity, reason: vars.reason ?? null, note: vars.note ?? null },
      );
      return data.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: stockKeys.all }),
  });
}

/** Record a stock count — sets the product's quantity to the counted value. */
export function useStockCount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { product: Product; counted: number; reason?: string; note?: string }) => {
      const { data } = await api.post<{ data: StockMovement }>(
        `products/${vars.product.id}/stock-count`,
        { counted: vars.counted, reason: vars.reason ?? null, note: vars.note ?? null },
      );
      return data.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: stockKeys.all }),
  });
}

/** Export the stock-movements ledger to .xlsx, honouring the current filters (admin only). */
export function downloadStockMovementsExport(params: Record<string, unknown>): Promise<void> {
  return downloadExport("stock-movements/export", params, "stock-movements.xlsx");
}