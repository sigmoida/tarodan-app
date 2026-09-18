"use client";

import { useQuery } from "@tanstack/react-query";
import type { AdminOrderCounts } from "@tarodan/types";
import { adminApi } from "@/lib/api";
import { adminKeys } from "@/lib/query/keys";
import { useResourceList } from "@/components/list";
import { listFilterParams } from "@/hooks/useAdminResource";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";

const COUNTS_STALE_MS = 30_000;

/**
 * Sekme ve alt sekme rozetleri: TEK istek, listenin arama + filtreleriyle.
 * Anahtar `adminKeys.count("orders", …)` olduğundan sipariş mutasyonları
 * (`useAdminMutation({ invalidates: ["orders"] })`) sayaçları da tazeler.
 * Arama kutusu anlık değer taşır; sayaç her tuşta değil, yazma durunca gider.
 */
export function useOrderCounts(): AdminOrderCounts | undefined {
  const { search, filters } = useResourceList();
  const debouncedSearch = useDebouncedValue(search);
  const params = listFilterParams(debouncedSearch, filters);
  const { data } = useQuery({
    queryKey: adminKeys.count("orders", params),
    queryFn: async () => (await adminApi.getOrderCounts(params)).data,
    staleTime: COUNTS_STALE_MS,
  });
  return data;
}
