"use client";

import { useTranslations } from "next-intl";
import { adminApi } from "@/lib/api";
import { ResourceList } from "@/components/list";
import { orderFilterFields } from "../_lib/filters";
import { DeepLinkFilterSummary } from "./DeepLinkFilterSummary";
import { OrdersTable } from "./OrdersTable";

/** "Siparişler" sekmesi — eski sipariş listesi sayfasının gövdesi, aynen. */
export function OrdersTab() {
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
        title={t("admin.operations.orders.tabs.orders")}
        description={
          <DeepLinkFilterSummary
            totalLabel={(count) =>
              t("admin.operations.orders.totalCount", { count })
            }
          />
        }
      />
      <ResourceList.Toolbar />
      <OrdersTable />
      <ResourceList.Pagination />
    </ResourceList>
  );
}
