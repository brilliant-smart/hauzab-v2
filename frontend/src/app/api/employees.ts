import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/app/lib/api";
import { Employee, Paginated } from "./types";

export const employeeKeys = {
  all: ["employees"] as const,
  list: (params: Record<string, unknown>) => ["employees", "list", params] as const,
  detail: (id: number) => ["employees", "detail", id] as const,
};

export function useEmployees(params: Record<string, unknown> = {}) {
  return useQuery({
    queryKey: employeeKeys.list(params),
    queryFn: async () => {
      const { data } = await api.get<Paginated<Employee>>("users", { params });
      return data;
    },
    placeholderData: keepPreviousData,
  });
}

export function useEmployee(id: number | undefined) {
  return useQuery({
    queryKey: employeeKeys.detail(id ?? 0),
    queryFn: async () => {
      const { data } = await api.get<{ data: Employee }>(`users/${id}`);
      return data.data;
    },
    enabled: !!id,
  });
}

export function useSaveEmployee() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { id?: number; payload: Record<string, unknown> }) => {
      if (vars.id) {
        const { data } = await api.put<{ data: Employee }>(`users/${vars.id}`, vars.payload);
        return data.data;
      }
      const { data } = await api.post<{ data: Employee }>("users", vars.payload);
      return data.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: employeeKeys.all }),
  });
}

export function useDeleteEmployee() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => api.delete(`users/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: employeeKeys.all }),
  });
}