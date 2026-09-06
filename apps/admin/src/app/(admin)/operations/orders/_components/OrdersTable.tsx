"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { DataTable } from "@/components/DataTable";
import { useResourceList } from "@/components/list";
import { orderColumns } from "../_lib/columns";
import { mapOrders, useOrderGroups } from "../_lib/orders";
import { OrderGroupDetail } from "./OrderGroupDetail";

/**
 * The orders table. Each placed order / checkout group is ONE row; its line
 * items (one per product, grouped by koli) are ALWAYS shown in a card under the
 * row — no toggle. Reads rows from the ResourceList context.
 */
export function OrdersTable() {
  const t = useTranslations();
  const { rows, isLoading, search, filters, sort, setSort } =
    useResourceList<any>();

  const orders = useMemo(() => mapOrders(rows, t), [rows, t]);
  const displayRows = useOrderGroups(orders);
  const columns = useMemo(() => orderColumns({ t }), [t]);

  const emptyText =
    search || filters.status !== "all" || filters.userId || filters.productId
      ? t("admin.operations.orders.emptyFiltered")
      : t("admin.operations.orders.empty");

  return (
    <DataTable
      columns={columns}
      data={displayRows}
      loading={isLoading}
      emptyText={emptyText}
      getRowId={(o) => o.id}
      expandAll
      renderExpanded={(row) => <OrderGroupDetail row={row} />}
      sort={sort}
      onSort={setSort}
    />
  );
}
