import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { api } from "@/app/lib/api";
import { downloadExport } from "@/app/lib/exportDownload";
import { Order, Paginated, SalesAuditRow, StaffSalesRow } from "./types";

export const reportKeys = {
  sales: (params: Record<string, unknown>) => ["reports", "sales", params] as const,
  salesAudit: (params: Record<string, unknown>) => ["reports", "sales-audit", params] as const,
  staffSales: (params: Record<string, unknown>) => ["reports", "staff-sales", params] as const,
};

export interface SalesReportPage extends Paginated<Order> {
  sums: { count: number; total: string; amount_paid: string };
}

export interface SalesAuditPage extends Paginated<SalesAuditRow> {
  sums: { count: number; sold: string; amount: string };
}

export function useSalesReport(params: Record<string, unknown> = {}) {
  return useQuery({
    queryKey: reportKeys.sales(params),
    queryFn: async () => {
      const { data } = await api.get<SalesReportPage>("reports/sales", { params });
      return data;
    },
    placeholderData: keepPreviousData,
  });
}

export function useSalesAudit(params: Record<string, unknown> = {}) {
  return useQuery({
    queryKey: reportKeys.salesAudit(params),
    queryFn: async () => {
      const { data } = await api.get<SalesAuditPage>("reports/sales-audit", { params });
      return data;
    },
    placeholderData: keepPreviousData,
  });
}

export function useStaffSales(params: Record<string, unknown> = {}) {
  return useQuery({
    queryKey: reportKeys.staffSales(params),
    queryFn: async () => {
      const { data } = await api.get<{ data: StaffSalesRow[] }>("reports/staff-sales", { params });
      return data.data;
    },
  });
}

export function downloadSalesReportExport(params: Record<string, unknown>): Promise<void> {
  return downloadExport("reports/sales/export", params, "sales-report.xlsx");
}

export function downloadSalesHistoryExport(params: Record<string, unknown>): Promise<void> {
  return downloadExport("reports/sales-history/export", params, "sales-history.xlsx");
}

export function downloadSalesAuditExport(params: Record<string, unknown>): Promise<void> {
  return downloadExport("reports/sales-audit/export", params, "sales-audit.xlsx");
}

export function downloadStaffSalesExport(params: Record<string, unknown>): Promise<void> {
  return downloadExport("reports/staff-sales/export", params, "staff-sales.xlsx");
}