"use client";

import { useTranslations } from "next-intl";
import { adminApi } from "@/lib/api";
import { ResourceList } from "@/components/list";
import { orderShipmentFilterFields } from "../_lib/filters";
import { OrderShipmentsTable } from "./OrderShipmentsTable";
import type { OrderShipmentRow } from "../_lib/types";

export function OrderShipmentsTab() {
  const t = useTranslations();
  return (
    <ResourceList<OrderShipmentRow>
      resource="shipping-shipments"
      fetcher={(p) => adminApi.getShipments(p)}
      getRowId={(r) => r.id}
      syncUrl
      filters={orderShipmentFilterFields(t)}
    >
      <ResourceList.Toolbar />
      <OrderShipmentsTable />
      <ResourceList.Pagination />
    </ResourceList>
  );
}
