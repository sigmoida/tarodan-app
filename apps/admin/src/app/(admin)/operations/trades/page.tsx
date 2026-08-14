"use client";

import { useTranslations } from "next-intl";
import { adminApi } from "@/lib/api";
import { ResourceList } from "@/components/list";
import { tradeFilterFields } from "./_lib/filters";
import { TradesSummary } from "./_components/TradesSummary";
import { TradesHeaderActions } from "./_components/TradesHeaderActions";
import { TradesTable } from "./_components/TradesTable";

export default function TradesPage() {
  const t = useTranslations();
  return (
    <ResourceList
      resource="trades"
      fetcher={(p) => adminApi.getTrades(p)}
      getRowId={(t: any) => t.id}
      syncUrl
      filters={tradeFilterFields(t)}
      // `userId` has no control — TradesSummary offers a "clear" for the deep link.
      initialFilters={{ userId: "" }}
    >
      <ResourceList.Header
        title={t("admin.operations.trades.title")}
        description={<TradesSummary />}
        actions={<TradesHeaderActions />}
      />
      <ResourceList.Toolbar />
      <TradesTable />
      <ResourceList.Pagination />
    </ResourceList>
  );
}
