import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/app/lib/api";
import { Device, ListResponse } from "./types";

export const deviceKeys = {
  all: ["devices"] as const,
  list: () => ["devices", "list"] as const,
};

export function useDevices() {
  return useQuery({
    queryKey: deviceKeys.list(),
    queryFn: async () => {
      const { data } = await api.get<ListResponse<Device>>("devices");
      return data.data;
    },
  });
}

export function useSaveDevice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { id?: number; payload: Record<string, unknown> }) => {
      if (vars.id) {
        const { data } = await api.put<{ data: Device }>(`devices/${vars.id}`, vars.payload);
        return data.data;
      }
      const { data } = await api.post<{ data: Device }>("devices", vars.payload);
      return data.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: deviceKeys.all });
    },
  });
}

export function useDeleteDevice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => api.delete(`devices/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: deviceKeys.all }),
  });
}