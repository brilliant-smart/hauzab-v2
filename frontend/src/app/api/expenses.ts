import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/app/lib/api";
import { Expense, ExpenseCategory, ListResponse, Paginated } from "./types";

export const expenseCategoryKeys = {
  all: ["expense-categories"] as const,
  list: ["expense-categories", "list"] as const,
};

export const expenseKeys = {
  all: ["expenses"] as const,
  list: (params: Record<string, unknown>) => ["expenses", "list", params] as const,
};

export function useExpenseCategories() {
  return useQuery({
    queryKey: expenseCategoryKeys.list,
    queryFn: async () => {
      const { data } = await api.get<ListResponse<ExpenseCategory>>("expense-categories");
      return data.data;
    },
  });
}

export function useSaveExpenseCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { id?: number; payload: Record<string, unknown> }) => {
      if (vars.id) {
        const { data } = await api.put<{ data: ExpenseCategory }>(`expense-categories/${vars.id}`, vars.payload);
        return data.data;
      }
      const { data } = await api.post<{ data: ExpenseCategory }>("expense-categories", vars.payload);
      return data.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: expenseCategoryKeys.list }),
  });
}

export function useDeleteExpenseCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => api.delete(`expense-categories/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: expenseCategoryKeys.list }),
  });
}

export function useExpenses(params: Record<string, unknown> = {}) {
  return useQuery({
    queryKey: expenseKeys.list(params),
    queryFn: async () => {
      const { data } = await api.get<Paginated<Expense>>("expenses", { params });
      return data;
    },
    placeholderData: keepPreviousData,
  });
}

export function useSaveExpense() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { id?: number; payload: Record<string, unknown> }) => {
      if (vars.id) {
        const { data } = await api.put<{ data: Expense }>(`expenses/${vars.id}`, vars.payload);
        return data.data;
      }
      const { data } = await api.post<{ data: Expense }>("expenses", vars.payload);
      return data.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: expenseKeys.all }),
  });
}

export function useDeleteExpense() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => api.delete(`expenses/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: expenseKeys.all }),
  });
}