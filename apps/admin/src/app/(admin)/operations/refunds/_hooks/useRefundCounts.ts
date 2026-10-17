"use client";

import { useQuery } from "@tanstack/react-query";
import type { AdminRefundBucket, AdminRefundTab } from "@tarodan/types";
import { adminApi } from "@/lib/api";
import { adminKeys } from "@/lib/query/keys";
import { useResourceList } from "@/components/list";
import { listFilterParams } from "@/hooks/useAdminResource";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { REFUND_REQUESTS_RESOURCE } from "../_lib/resource";

const COUNTS_STALE_MS = 30_000;

/**
 * Etkin üst sekmenin alt sekme rozetleri: TEK istek, listenin arama +
 * filtreleriyle (liste ile rozet aynı kümeyi sayar). Anahtar
 * `adminKeys.count(REFUND_REQUESTS_RESOURCE, …)` — iade mutasyonları
 * (`invalidates: ["refund-requests"]`) sayaçları da tazeler.
 */
export function useRefundCounts(
  tab: AdminRefundTab,
): Record<AdminRefundBucket, number> | undefined {
  const { search, filters } = useResourceList();
  const debouncedSearch = useDebouncedValue(search);
  const params = { ...listFilterParams(debouncedSearch, filters), tab };
  const { data } = useQuery({
    queryKey: adminKeys.count(REFUND_REQUESTS_RESOURCE, params),
    queryFn: async () => (await adminApi.getRefundRequestCounts(params)).data,
    staleTime: COUNTS_STALE_MS,
  });
  return data;
}
