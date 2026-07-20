"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { DataTable } from "@/components/DataTable";
import { useResourceList } from "@/components/list";
import { StatusUpdateModal } from "../[id]/_modals/StatusUpdateModal";
import { orderColumns } from "../_lib/columns";
import { orderRowMenu } from "../_lib/rowActions";
import { type Order, mapOrders, useOrderGroups } from "../_lib/orders";

/**
 * The orders table — the page's unique logic (checkout-group accordion) lives
 * here, reading rows from the ResourceList context. Status editing goes through
 * the shared StatusUpdateModal (same as the detail page).
 */
export function OrdersTable() {
  const t = useTranslations();
  const router = useRouter();
  const { rows, isLoading, search, filters, sort, setSort } =
    useResourceList<any>();

  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [statusOrder, setStatusOrder] = useState<Order | null>(null);

  const toggleGroup = (gid: string) =>
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(gid)) next.delete(gid);
      else next.add(gid);
      return next;
    });

  const orders = useMemo(() => mapOrders(rows, t), [rows, t]);
  const { displayRows, rowClassById } = useOrderGroups(orders, expandedGroups);

  const columns = orderColumns({
    t,
    expandedGroups,
    toggleGroup,
    rowMenu: orderRowMenu(t, {
      onView: (o) => router.push(`/operations/orders/${o.id}`),
      onEditStatus: (o) => setStatusOrder(o),
    }),
  });

  const emptyText =
    search || filters.status !== "all" || filters.userId
      ? t("admin.operations.orders.emptyFiltered")
      : t("admin.operations.orders.empty");

  return (
    <>
      <DataTable
        columns={columns}
        data={displayRows}
        loading={isLoading}
        rowClassName={(o) => rowClassById.get(o.id)}
        emptyText={emptyText}
        getRowId={(o) => o.id}
        sort={sort}
        onSort={setSort}
      />
      {statusOrder && (
        <StatusUpdateModal
          open
          orderId={statusOrder.id}
          currentStatus={statusOrder.status}
          onClose={() => setStatusOrder(null)}
        />
      )}
    </>
  );
}
