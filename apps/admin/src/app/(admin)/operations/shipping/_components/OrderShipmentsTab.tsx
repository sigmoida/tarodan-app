"use client";

import { useTranslations } from "next-intl";
import { adminApi } from "@/lib/api";
import { ResourceList } from "@/components/list";
import { statusOptions } from "../_shared";
import { orderShipmentColumns } from "../_lib/columns";
import type { OrderShipmentRow } from "../_lib/types";

export function OrderShipmentsTab() {
  const t = useTranslations();
  return (
    <ResourceList<OrderShipmentRow>
      resource="shipping-shipments"
      fetcher={(p) => adminApi.getShipments(p)}
      getRowId={(r) => r.id}
      syncUrl
      initialFilters={{ status: "all" }}
    >
      <ResourceList.Toolbar>
        <ResourceList.Search />
        <ResourceList.FilterSelect
          name="status"
          options={statusOptions(t)}
          className="sm:w-56"
        />
      </ResourceList.Toolbar>
      <ResourceList.Table
        columns={orderShipmentColumns(t)}
        emptyText={t("admin.operations.shipping.orders.empty")}
      />
      <ResourceList.Total unit={t("admin.operations.shipping.orders.unit")} />
      <ResourceList.Pagination />
    </ResourceList>
  );
}
