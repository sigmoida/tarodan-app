"use client";

import { useTranslations } from "next-intl";
import { adminApi } from "@/lib/api";
import { ResourceList } from "@/components/list";
import { tradeShipmentFilterFields } from "../_lib/filters";
import { tradeShipmentColumns } from "../_lib/columns";
import type { TradeShipmentRow } from "../_lib/types";

export function TradeShipmentsTab() {
  const t = useTranslations();
  return (
    <ResourceList<TradeShipmentRow>
      resource="trade-shipments"
      fetcher={(params) => adminApi.getTradeShipments(params)}
      getRowId={(r) => r.id}
      syncUrl
      filters={tradeShipmentFilterFields(t)}
    >
      <ResourceList.Toolbar />
      <ResourceList.Table
        columns={tradeShipmentColumns(t)}
        emptyText={t("admin.operations.shipping.trades.empty")}
      />
      <ResourceList.Pagination />
    </ResourceList>
  );
}
