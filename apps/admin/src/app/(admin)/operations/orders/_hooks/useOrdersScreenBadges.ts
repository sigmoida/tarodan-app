"use client";

import { useSearchParams } from "next/navigation";
import { isAdminOrderListTab, type AdminOrdersScreenTab } from "@tarodan/types";
import { adminApi } from "@/lib/api";
import { useResourceList } from "@/components/list";
import { useListTotal } from "@/hooks/useListTotal";
import { usePermissions } from "@/context/PermissionsContext";
import { TRADES_SCOPE_PARAMS, scopeParamsOf } from "../_lib/screenTabs";
import { useOrderCounts } from "./useOrderCounts";

/**
 * Üst sekme rozetleri. Etkin sekme kendi listesinin toplamını gösterir (arama
 * + filtrelerle); pasif sekmeler geçildiğinde görülecek kümeyi, yani yalnız
 * deep-link kapsamını sayar.
 * - sipariş sekmeleri: tek sayaç isteği (`useOrderCounts`)
 * - Teklifler / Takaslar: sayaç ucu yok → listenin kendi ucunun `meta.total`'ı
 * Yetkisi olmayan sekmenin isteği atılmaz (sekme zaten gizli).
 */
export function useOrdersScreenBadges(
  tab: AdminOrdersScreenTab,
): Partial<Record<AdminOrdersScreenTab, number>> {
  const { can } = usePermissions();
  const { total, isLoading } = useResourceList();
  const searchParams = useSearchParams();
  const activeTotal = isLoading ? undefined : total;

  const orderCounts = useOrderCounts(isAdminOrderListTab(tab));
  const offers = useListTotal(
    "offers",
    scopeParamsOf(searchParams),
    adminApi.getOffers,
    { enabled: tab !== "offers" && can("orders") },
  );
  const trades = useListTotal(
    "trades",
    scopeParamsOf(searchParams, TRADES_SCOPE_PARAMS),
    adminApi.getTrades,
    { enabled: tab !== "trades" && can("trades") },
  );

  return {
    all: orderCounts?.all.total,
    direct_sale: orderCounts?.direct_sale.total,
    offer_order: orderCounts?.offer_order.total,
    offers: tab === "offers" ? activeTotal : offers.data,
    trades: tab === "trades" ? activeTotal : trades.data,
  };
}
