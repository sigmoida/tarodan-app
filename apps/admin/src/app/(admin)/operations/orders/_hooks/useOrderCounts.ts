"use client";

import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import type { AdminOrderCounts } from "@tarodan/types";
import { adminApi } from "@/lib/api";
import { adminKeys } from "@/lib/query/keys";
import { useResourceList } from "@/components/list";
import { listFilterParams } from "@/hooks/useAdminResource";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { usePermissions } from "@/context/PermissionsContext";
import { scopeParamsOf } from "../_lib/screenTabs";

const COUNTS_STALE_MS = 30_000;

/**
 * Sipariş sekmelerinin ve alt sekmelerinin rozetleri: TEK istek.
 * - `listScoped`: etkin liste bir sipariş listesidir → sayaçlar onun arama +
 *   filtreleriyle gider (liste ile rozet aynı kümeyi sayar).
 * - değilse (Teklifler / Takaslar açık): yalnız deep-link kapsamıyla — sipariş
 *   sekmesine geçildiğinde filtreler silinir, kapsam kalır.
 * Anahtar `adminKeys.count("orders", …)` olduğundan sipariş mutasyonları
 * sayaçları da tazeler. `orders` izni olmayan (yalnız takas yetkili) kullanıcı
 * için istek atılmaz.
 */
export function useOrderCounts(
  listScoped: boolean,
): AdminOrderCounts | undefined {
  const { can } = usePermissions();
  const { search, filters } = useResourceList();
  const searchParams = useSearchParams();
  const debouncedSearch = useDebouncedValue(search);
  const params = listScoped
    ? listFilterParams(debouncedSearch, filters)
    : scopeParamsOf(searchParams);
  const { data } = useQuery({
    queryKey: adminKeys.count("orders", params),
    queryFn: async () => (await adminApi.getOrderCounts(params)).data,
    staleTime: COUNTS_STALE_MS,
    enabled: can("orders"),
  });
  return data;
}
