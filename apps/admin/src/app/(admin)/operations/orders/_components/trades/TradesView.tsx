"use client";

import { useTranslations } from "next-intl";
import { adminApi } from "@/lib/api";
import { ResourceList } from "@/components/list";
import { tradeFilterFields } from "../../_lib/trades/filters";
import { OrdersScreenTabBar } from "../OrdersScreenTabBar";
import { TradesSummary } from "./TradesSummary";
import { TradesHeaderActions } from "./TradesHeaderActions";
import { TradesTable } from "./TradesTable";

/**
 * Takaslar sekmesi (eski `/operations/trades` listesi — aynı tablo, filtreler
 * ve anlaşmazlık rozeti). İzin `trades`: yalnız takas yetkili kullanıcı
 * ekranda yalnız bu sekmeyi görür.
 */
export function TradesView() {
  const t = useTranslations();
  return (
    <ResourceList
      resource="trades"
      fetcher={(p) => adminApi.getTrades(p)}
      getRowId={(trade: { id: string }) => trade.id}
      syncUrl
      filters={tradeFilterFields(t)}
      // `userId` has no control — TradesSummary offers a "clear" for the deep link.
      initialFilters={{ userId: "" }}
    >
      <OrdersScreenTabBar />
      <ResourceList.Toolbar />
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted">
          <TradesSummary />
        </p>
        <TradesHeaderActions />
      </div>
      <TradesTable />
      <ResourceList.Pagination />
    </ResourceList>
  );
}
