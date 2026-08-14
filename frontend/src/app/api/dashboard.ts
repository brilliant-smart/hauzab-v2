import { useQuery } from "@tanstack/react-query";
import { api } from "@/app/lib/api";
import { DashboardSummary } from "./types";

export const dashboardKeys = {
  summary: ["dashboard", "summary"] as const,
};

export function useDashboardSummary() {
  return useQuery({
    queryKey: dashboardKeys.summary,
    queryFn: async () => {
      const { data } = await api.get<DashboardSummary>("dashboard/summary");
      return data;
    },
  });
}