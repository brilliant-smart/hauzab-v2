import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/app/lib/api";
import { handleApiError } from "@/app/lib/errorHandler";
import { CreateOrderPayload, Order, Paginated } from "./types";

export const orderKeys = {
  all: ["orders"] as const,
  list: (params: Record<string, unknown>) => ["orders", "list", params] as const,
  detail: (id: number) => ["orders", "detail", id] as const,
};

export function useOrders(params: Record<string, unknown> = {}) {
  return useQuery({
    queryKey: orderKeys.list(params),
    queryFn: async () => {
      const { data } = await api.get<Paginated<Order>>("orders", { params });
      return data;
    },
  });
}

export function useOrder(id: number | undefined) {
  return useQuery({
    queryKey: orderKeys.detail(id ?? 0),
    queryFn: async () => {
      const { data } = await api.get<{ data: Order }>(`orders/${id}`);
      return data.data;
    },
    enabled: !!id,
  });
}

export function useCreateOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: CreateOrderPayload) => {
      const { data } = await api.post<{ data: Order }>("orders", payload);
      return data.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: orderKeys.all });
      qc.invalidateQueries({ queryKey: ["products"] });
    },
    onError: (e) => handleApiError(e),
  });
}

export function useVoidOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const { data } = await api.post<{ data: Order }>(`orders/${id}/void`);
      return data.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: orderKeys.all });
      qc.invalidateQueries({ queryKey: ["products"] });
    },
    onError: (e) => handleApiError(e),
  });
}