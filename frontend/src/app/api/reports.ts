import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { api } from "@/app/lib/api";
import { Order, Paginated, SalesAuditRow, StaffSalesRow } from "./types";

export const reportKeys = {
  sales: (params: Record<string, unknown>) => ["reports", "sales", params] as const,
  salesAudit: (params: Record<string, unknown>) => ["reports", "sales-audit", params] as const,
  staffSales: (params: Record<string, unknown>) => ["reports", "staff-sales", params] as const,
};

export interface SalesReportPage extends Paginated<Order> {
  sums: { count: number; total: string; amount_paid: string };
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
      const { data } = await api.get<Paginated<SalesAuditRow>>("reports/sales-audit", { params });
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

/**
 * Download the Sales Audit spreadsheet. Streams the binary blob and hands it to
 * the browser as a click-triggered download (object URL revoked afterwards).
 */
export async function downloadSalesAuditExport(params: Record<string, unknown>): Promise<void> {
  const res = await api.get("reports/sales-audit/export", { params, responseType: "blob" });
  const url = URL.createObjectURL(res.data);
  const a = document.createElement("a");
  a.href = url;
  a.download = `sales-audit.xlsx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}