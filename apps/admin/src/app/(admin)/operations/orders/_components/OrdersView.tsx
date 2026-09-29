"use client";

import { useTranslations } from "next-intl";
import type { AdminOrderTab } from "@tarodan/types";
import { adminApi } from "@/lib/api";
import { ResourceList } from "@/components/list";
import { DeepLinkFilterSummary } from "@/components/list/DeepLinkFilterSummary";
import { ORDER_DEEP_LINK_FILTERS, orderFilterFields } from "../_lib/filters";
import { useOrderBucket } from "../_hooks/useOrderBucket";
import { OrdersScreenTabBar } from "./OrdersScreenTabBar";
import { OrderBucketBar } from "./OrderBucketBar";
import { OrdersTable } from "./OrdersTable";

/**
 * Sipariş sekmeleri (Tüm / Direkt Satış / Siparişe Dönen Teklifler) × alt
 * sekme (kova). Sekme ve kova URL'de yaşar ve her isteğe eklenir; filtre
 * değil, liste kapsamıdır. Liste kapsam değişince yeniden kurulur, filtreler
 * URL'den geri okunur.
 */
export function OrdersView({ tab }: { tab: AdminOrderTab }) {
  const t = useTranslations();
  const { bucket } = useOrderBucket(tab);

  return (
    <ResourceList
      key={`${tab}:${bucket}`}
      resource="orders"
      fetcher={(params) => adminApi.getOrders({ ...params, tab, bucket })}
      scope={{ tab, bucket }}
      getRowId={(row: { kind: string; id: string }) => `${row.kind}:${row.id}`}
      syncUrl
      filters={orderFilterFields(t)}
      initialFilters={ORDER_DEEP_LINK_FILTERS}
    >
      <div className="flex min-w-0 flex-col gap-3">
        <OrdersScreenTabBar />
        <OrderBucketBar tab={tab} />
      </div>
      <ResourceList.Toolbar />
      <p className="text-sm text-muted empty:hidden">
        <DeepLinkFilterSummary />
      </p>
      <OrdersTable />
      <ResourceList.Pagination />
    </ResourceList>
  );
}
