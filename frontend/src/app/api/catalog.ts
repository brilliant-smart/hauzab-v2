import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/app/lib/api";
import {
  ContactResource,
  ListResponse,
  NamedResource,
  Paginated,
  Product,
} from "./types";

export const productKeys = {
  all: ["products"] as const,
  list: (params: Record<string, unknown>) => ["products", "list", params] as const,
  lowStock: (params: Record<string, unknown>) => ["products", "low-stock", params] as const,
  expiring: (params: Record<string, unknown>) => ["products", "expiring", params] as const,
  detail: (id: number) => ["products", "detail", id] as const,
};

export type LookupKey =
  | "product-units"
  | "product-categories"
  | "product-manufacturers"
  | "product-suppliers";

export const lookupKeys = {
  list: (key: LookupKey) => [key, "list"] as const,
};

export function useProducts(params: Record<string, unknown> = {}) {
  return useQuery({
    queryKey: productKeys.list(params),
    queryFn: async () => {
      const { data } = await api.get<Paginated<Product>>("products", { params });
      return data;
    },
    placeholderData: keepPreviousData,
  });
}

export function useLowStock(params: Record<string, unknown> = {}) {
  return useQuery({
    queryKey: productKeys.lowStock(params),
    queryFn: async () => {
      const { data } = await api.get<Paginated<Product>>("products/low-stock", { params });
      return data;
    },
    placeholderData: keepPreviousData,
  });
}

export function useExpiring(params: Record<string, unknown> = {}) {
  return useQuery({
    queryKey: productKeys.expiring(params),
    queryFn: async () => {
      const { data } = await api.get<Paginated<Product>>("products/expiring", { params });
      return data;
    },
    placeholderData: keepPreviousData,
  });
}

export function useProduct(id: number | undefined) {
  return useQuery({
    queryKey: productKeys.detail(id ?? 0),
    queryFn: async () => {
      const { data } = await api.get<{ data: Product }>(`products/${id}`);
      return data.data;
    },
    enabled: !!id,
  });
}

export function useSaveProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { id?: number; payload: Record<string, unknown> }) => {
      if (vars.id) {
        const { data } = await api.put<{ data: Product }>(`products/${vars.id}`, vars.payload);
        return data.data;
      }
      const { data } = await api.post<{ data: Product }>("products", vars.payload);
      return data.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: productKeys.all });
    },
  });
}

export function useDeleteProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => api.delete(`products/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: productKeys.all }),
  });
}

type LookupResource = NamedResource & Partial<ContactResource>;

export function useLookupList<T extends LookupResource = NamedResource>(key: LookupKey) {
  return useQuery({
    queryKey: lookupKeys.list(key),
    queryFn: async () => {
      const { data } = await api.get<ListResponse<T>>(key, {
        params: { with_products_count: true },
      });
      return data.data;
    },
  });
}

export function useSaveLookup(key: LookupKey) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { id?: number; payload: Record<string, unknown> }) => {
      if (vars.id) {
        const { data } = await api.put<{ data: LookupResource }>(`${key}/${vars.id}`, vars.payload);
        return data.data;
      }
      const { data } = await api.post<{ data: LookupResource }>(key, vars.payload);
      return data.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: lookupKeys.list(key) }),
  });
}

export function useDeleteLookup(key: LookupKey) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => api.delete(`${key}/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: lookupKeys.list(key) }),
  });
}