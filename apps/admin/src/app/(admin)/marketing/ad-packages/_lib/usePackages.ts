import { useQuery } from "@tanstack/react-query";
import { adminApi } from "@/lib/api";
import { adminKeys } from "@/lib/query/keys";
import { type AdPackage } from "./types";

/**
 * Loads all ad packages (with tiers) in one shot — the set is tiny (a handful of
 * packages), so no server pagination. Keyed `['ad-packages']` so package
 * mutations (`invalidates: ['ad-packages']`) refresh the grid.
 */
export function usePackages() {
  return useQuery({
    queryKey: adminKeys.all("ad-packages"),
    queryFn: async () => {
      const res = await adminApi.get("/admin/ad-packages");
      return (res.data?.data ?? res.data ?? []) as AdPackage[];
    },
    staleTime: 30_000,
  });
}
