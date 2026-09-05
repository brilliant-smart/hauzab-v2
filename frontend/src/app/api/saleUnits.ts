import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/app/lib/api";
import { ProductSaleUnit } from "./types";
import { productKeys } from "./catalog";

export const saleUnitKeys = {
  list: (productId: number) => ["sale-units", "list", productId] as const,
};

export function useSaleUnits(productId: number | undefined) {
  return useQuery({
    queryKey: saleUnitKeys.list(productId ?? 0),
    queryFn: async () => {
      const { data } = await api.get<{ data: ProductSaleUnit[] }>(
        `products/${productId}/sale-units`,
      );
      return data.data;
    },
    enabled: !!productId,
  });
}

export interface SaleUnitInput {
  unit_id: number;
  factor: number;
  selling_price: number;
}

export function useAddSaleUnit(productId: number | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: SaleUnitInput) => {
      const { data } = await api.post<{ data: ProductSaleUnit }>(
        `products/${productId}/sale-units`,
        vars,
      );
      return data.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: saleUnitKeys.list(productId ?? 0) });
      // Product list/detail carry sale_units inline (for the POS picker).
      qc.invalidateQueries({ queryKey: productKeys.all });
    },
  });
}

export function useDeleteSaleUnit(productId: number | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => api.delete(`products/${productId}/sale-units/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: saleUnitKeys.list(productId ?? 0) });
      qc.invalidateQueries({ queryKey: productKeys.all });
    },
  });
}