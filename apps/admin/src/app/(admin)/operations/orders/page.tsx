/** @format */

"use client";

import { useTranslations } from "next-intl";
import { adminApi } from "@/lib/api";
import { ResourceList } from "@/components/list";
import { orderFilterFields } from "./_lib/filters";
import { OrdersSummary } from "./_components/OrdersSummary";
import { OrdersTable } from "./_components/OrdersTable";

export default function OrdersPage() {
  const t = useTranslations();
  return (
    <ResourceList
      resource="orders"
      fetcher={(p) => adminApi.getOrders(p)}
      getRowId={(o: any) => o.id}
      syncUrl
      filters={orderFilterFields(t)}
      // No controls of their own — deep links from user/product detail pages.
      initialFilters={{ userId: "", productId: "" }}
    >
      <ResourceList.Header
        title={t("admin.operations.orders.title")}
        description={<OrdersSummary />}
      />
      <ResourceList.Toolbar />
      <OrdersTable />
      <ResourceList.Pagination />
    </ResourceList>
  );
}
