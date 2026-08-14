import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/app/lib/api";
import { Consignment, Paginated } from "./types";

export const consignmentKeys = {
  all: ["consignments"] as const,
  list: (params: Record<string, unknown>) => ["consignments", "list", params] as const,
  detail: (id: number) => ["consignments", "detail", id] as const,
};

export function useConsignments(params: Record<string, unknown> = {}) {
  return useQuery({
    queryKey: consignmentKeys.list(params),
    queryFn: async () => {
      const { data } = await api.get<Paginated<Consignment>>("consignments", { params });
      return data;
    },
    placeholderData: keepPreviousData,
  });
}

export function useConsignment(id: number | undefined) {
  return useQuery({
    queryKey: consignmentKeys.detail(id ?? 0),
    queryFn: async () => {
      const { data } = await api.get<{ data: Consignment }>(`consignments/${id}`);
      return data.data;
    },
    enabled: !!id,
  });
}

export function useSaveConsignment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { id?: number; payload: Record<string, unknown> }) => {
      if (vars.id) {
        const { data } = await api.put<{ data: Consignment }>(`consignments/${vars.id}`, vars.payload);
        return data.data;
      }
      const { data } = await api.post<{ data: Consignment }>("consignments", vars.payload);
      return data.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: consignmentKeys.all }),
  });
}

export function useDeleteConsignment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => api.delete(`consignments/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: consignmentKeys.all }),
  });
}