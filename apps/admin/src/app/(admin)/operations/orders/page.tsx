/** @format */

"use client";

import { useTranslations } from "next-intl";
import { adminApi } from "@/lib/api";
import { ResourceList } from "@/components/list";
import { statusOptions } from "./_lib/orders";
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
      initialFilters={{ status: "all", userId: "", productId: "" }}
      errorMessage={t("admin.operations.orders.loadError")}
    >
      <ResourceList.Header
        title={t("admin.operations.orders.title")}
        description={<OrdersSummary />}
      />
      <ResourceList.Toolbar>
        <ResourceList.Search />
        <ResourceList.FilterSelect
          name="status"
          options={statusOptions}
          className="sm:w-48"
        />
      </ResourceList.Toolbar>
      <OrdersTable />
      <ResourceList.Pagination />
    </ResourceList>
  );
}
