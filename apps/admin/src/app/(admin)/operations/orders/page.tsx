/** @format */

"use client";

import { useTranslations } from "next-intl";
import { adminApi } from "@/lib/api";
import { AdminPage } from "@/components/page/AdminPage";
import { PageHeader } from "@/components/AdminList";
import { ResourceList } from "@/components/list";
import { DeepLinkFilterSummary } from "@/components/list/DeepLinkFilterSummary";
import { ORDER_DEEP_LINK_FILTERS, orderFilterFields } from "./_lib/filters";
import { useOrderTabs } from "./_hooks/useOrderTabs";
import { OrderTabBar } from "./_components/OrderTabBar";
import { OrdersTable } from "./_components/OrdersTable";

/**
 * Siparişler: sekme (Tüm / Direkt Satış / Teklifler) × alt sekme (kova).
 * Sekme ve kova URL'de yaşar ve her isteğe eklenir; filtre değil, liste
 * kapsamıdır. Liste kova değişince yeniden kurulur, filtreler URL'den geri
 * okunur. Takaslar ayrı ekrandadır (/operations/trades).
 */
export default function OrdersPage() {
  const t = useTranslations();
  const { tab, bucket } = useOrderTabs();

  return (
    <AdminPage>
      <PageHeader
        title={t("admin.operations.orders.title")}
        description={t("admin.operations.orders.pageDescription")}
      />
      <ResourceList
        key={`${tab}:${bucket}`}
        resource="orders"
        fetcher={(params) => adminApi.getOrders({ ...params, tab, bucket })}
        getRowId={(row: { kind: string; id: string }) =>
          `${row.kind}:${row.id}`
        }
        syncUrl
        filters={orderFilterFields(t)}
        initialFilters={ORDER_DEEP_LINK_FILTERS}
      >
        <OrderTabBar />
        <ResourceList.Toolbar />
        <p className="text-sm text-muted empty:hidden">
          <DeepLinkFilterSummary />
        </p>
        <OrdersTable />
        <ResourceList.Pagination />
      </ResourceList>
    </AdminPage>
  );
}
