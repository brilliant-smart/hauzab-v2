import { useQuery } from "@tanstack/react-query";
import { api } from "@/app/lib/api";
import { Branch, ListResponse } from "./types";

export const branchKeys = {
  all: ["branches"] as const,
  list: () => ["branches", "list"] as const,
};

export function useBranches() {
  return useQuery({
    queryKey: branchKeys.list(),
    queryFn: async () => {
      const { data } = await api.get<ListResponse<Branch>>("branches");
      return data.data;
    },
  });
}