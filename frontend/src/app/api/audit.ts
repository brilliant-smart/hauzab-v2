import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { api } from "@/app/lib/api";
import { downloadExport } from "@/app/lib/exportDownload";
import { AuditLogEntry, Paginated } from "./types";

export const auditKeys = {
  list: (params: Record<string, unknown>) => ["audit-logs", "list", params] as const,
};

export function useAuditLogs(params: Record<string, unknown> = {}) {
  return useQuery({
    queryKey: auditKeys.list(params),
    queryFn: async () => {
      const { data } = await api.get<Paginated<AuditLogEntry>>("audit-logs", { params });
      return data;
    },
    placeholderData: keepPreviousData,
  });
}

/** Export the activity log to .xlsx, honouring the current search/action filters (admin only). */
export function downloadAuditLogExport(params: Record<string, unknown>): Promise<void> {
  return downloadExport("audit-logs/export", params, "activity-log.xlsx");
}