"use client";

import { useQuery } from "@tanstack/react-query";
import type { AdminCancellationCounts } from "@tarodan/types";
import { adminApi } from "@/lib/api";
import { adminKeys } from "@/lib/query/keys";
import { useResourceList } from "@/components/list";
import { listFilterParams } from "@/hooks/useAdminResource";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { CANCELLATIONS_RESOURCE } from "../_lib/resource";

const COUNTS_STALE_MS = 30_000;

/**
 * Sekme ve alt sekme rozetleri: TEK istek, listenin arama + filtreleriyle
 * (siparişler ekranının `useOrderCounts` deseni). Anahtar
 * `adminKeys.count(CANCELLATIONS_RESOURCE, …)` — iptali etkileyen bir mutasyon
 * sayaçları da tazeleyebilir.
 */
export function useCancellationCounts(): AdminCancellationCounts | undefined {
  const { search, filters } = useResourceList();
  const debouncedSearch = useDebouncedValue(search);
  const params = listFilterParams(debouncedSearch, filters);
  const { data } = useQuery({
    queryKey: adminKeys.count(CANCELLATIONS_RESOURCE, params),
    queryFn: async () => (await adminApi.getCancellationCounts(params)).data,
    staleTime: COUNTS_STALE_MS,
  });
  return data;
}
