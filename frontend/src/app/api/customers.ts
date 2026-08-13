import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/app/lib/api";
import { Customer, Paginated } from "./types";

export const customerKeys = {
  all: ["customers"] as const,
  list: (params: Record<string, unknown>) => ["customers", "list", params] as const,
};

export function useCustomers(params: Record<string, unknown> = {}) {
  return useQuery({
    queryKey: customerKeys.list(params),
    queryFn: async () => {
      const { data } = await api.get<Paginated<Customer>>("customers", { params });
      return data;
    },
  });
}

export function useSaveCustomer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { id?: number; payload: Record<string, unknown> }) => {
      if (vars.id) {
        const { data } = await api.put<{ data: Customer }>(`customers/${vars.id}`, vars.payload);
        return data.data;
      }
      const { data } = await api.post<{ data: Customer }>("customers", vars.payload);
      return data.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: customerKeys.all }),
  });
}

export function useDeleteCustomer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => api.delete(`customers/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: customerKeys.all }),
  });
}