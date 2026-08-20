import { useQuery } from "@tanstack/react-query";
import { api } from "@/app/lib/api";
import { DashboardCharts, DashboardSummary } from "./types";

export const dashboardKeys = {
  summary: ["dashboard", "summary"] as const,
  charts: ["dashboard", "charts"] as const,
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

export function useDashboardCharts() {
  return useQuery({
    queryKey: dashboardKeys.charts,
    queryFn: async () => {
      const { data } = await api.get<DashboardCharts>("dashboard/charts");
      return data;
    },
    staleTime: 60_000,
  });
}