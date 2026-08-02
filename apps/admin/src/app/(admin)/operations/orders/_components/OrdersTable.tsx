"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { DataTable } from "@/components/DataTable";
import { useResourceList } from "@/components/list";
import { orderColumns } from "../_lib/columns";
import { mapOrders, useOrderGroups } from "../_lib/orders";
import { OrderGroupDetail } from "./OrderGroupDetail";

/**
 * The orders table. Each placed order / checkout group is ONE row; the row
 * expands into a detail row listing its product line-items (grouped by seller
 * when the cart has multiple satıcı-paketleri). Reads rows from the ResourceList
 * context; status editing goes through the shared StatusUpdateModal.
 */
export function OrdersTable() {
  const t = useTranslations();
  const { rows, isLoading, search, filters, sort, setSort } =
    useResourceList<any>();

  const [expandedId, setExpandedId] = useState<string | null>(null);

  const toggleRow = (id: string) =>
    setExpandedId((prev) => (prev === id ? null : id));

  const orders = useMemo(() => mapOrders(rows, t), [rows, t]);
  const displayRows = useOrderGroups(orders);

  const columns = orderColumns({
    t,
    expandedId,
    toggleRow,
  });

  const emptyText =
    search || filters.status !== "all" || filters.userId
      ? t("admin.operations.orders.emptyFiltered")
      : t("admin.operations.orders.empty");

  return (
    <DataTable
      columns={columns}
      data={displayRows}
      loading={isLoading}
      emptyText={emptyText}
      getRowId={(o) => o.id}
      expandedId={expandedId}
      renderExpanded={(row) => <OrderGroupDetail row={row} />}
      sort={sort}
      onSort={setSort}
    />
  );
}
