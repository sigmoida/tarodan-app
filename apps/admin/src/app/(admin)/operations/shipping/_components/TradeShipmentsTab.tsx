"use client";

import { useTranslations } from "next-intl";
import { adminApi } from "@/lib/api";
import { ResourceList } from "@/components/list";
import { statusOptions, legOptions } from "../_shared";
import { tradeShipmentColumns } from "../_lib/columns";
import type { TradeShipmentRow } from "../_lib/types";

export function TradeShipmentsTab() {
  const t = useTranslations();
  return (
    <ResourceList<TradeShipmentRow>
      resource="trade-shipments"
      fetcher={({ search: q, ...params }) =>
        adminApi.getTradeShipments({ ...params, tradeNumber: q || undefined })
      }
      getRowId={(r) => r.id}
      initialFilters={{ status: "all", leg: "all" }}
    >
      <ResourceList.Toolbar>
        <ResourceList.Search />
        <ResourceList.FilterSelect
          name="status"
          options={statusOptions(t)}
          className="sm:w-56"
        />
        <ResourceList.FilterSelect
          name="leg"
          options={legOptions(t)}
          className="sm:w-44"
        />
      </ResourceList.Toolbar>
      <ResourceList.Table
        columns={tradeShipmentColumns(t)}
        emptyText={t("admin.operations.shipping.trades.empty")}
      />
      <ResourceList.Total unit={t("admin.operations.shipping.trades.unit")} />
      <ResourceList.Pagination />
    </ResourceList>
  );
}
