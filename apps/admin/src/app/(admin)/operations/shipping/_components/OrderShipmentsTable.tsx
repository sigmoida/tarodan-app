"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { DataTable } from "@/components/DataTable";
import { useResourceList } from "@/components/list";
import { physicalShipmentColumns } from "../_lib/columns";
import { toPhysicalShipments } from "../_lib/shipments";
import type { OrderShipmentRow } from "../_lib/types";
import { OrderShipmentDetail } from "./OrderShipmentDetail";

/**
 * The order-shipments table. Its unique logic — collapsing sibling `Shipment`
 * rows that share a physical parcel into ONE row — lives here, reading rows from
 * the ResourceList context (same shape as `OrdersTable`). Sorting/pagination stay
 * server-driven; the merge only dedupes parcel rows within the page.
 */
export function OrderShipmentsTable() {
  const t = useTranslations();
  const { rows, isLoading, sort, setSort } =
    useResourceList<OrderShipmentRow>();
  const parcels = useMemo(() => toPhysicalShipments(rows), [rows]);
  const columns = useMemo(() => physicalShipmentColumns(t), [t]);

  return (
    <DataTable
      columns={columns}
      data={parcels}
      loading={isLoading}
      getRowId={(r) => r.id}
      emptyText={t("admin.operations.shipping.orders.empty")}
      expandAll
      renderExpanded={(shipment) => <OrderShipmentDetail shipment={shipment} />}
      sort={sort}
      onSort={setSort}
    />
  );
}
