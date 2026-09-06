/** @format */

"use client";

import { type ComponentType } from "react";
import { useTranslations } from "next-intl";
import { ShoppingCartIcon, TagIcon } from "@heroicons/react/24/outline";
import { adminApi } from "@/lib/api";
import { AdminPage } from "@/components/page/AdminPage";
import { PageHeader } from "@/components/AdminList";
import { AdminTabs } from "@/components/AdminTabs";
import { ResourceList } from "@/components/list";
import { DeepLinkFilterSummary } from "@/components/list/DeepLinkFilterSummary";
import { useListTotals } from "@/hooks/useListTotal";
import { useTabParam } from "@/hooks/useTabParam";
import type { OrderOrigin } from "@/lib/utils";
import { orderFilterFields } from "./_lib/filters";
import { OrdersTable } from "./_components/OrdersTable";

type TabKey = "dogrudan" | "teklif";

interface TabDef {
  key: TabKey;
  origin: OrderOrigin;
  labelKey:
    | "admin.operations.orders.tabs.directSale"
    | "admin.operations.orders.tabs.acceptedOffers";
  icon: ComponentType<{ className?: string }>;
}

/**
 * Siparişler kaynağa göre iki sekmede: doğrudan satış / kabul edilen teklif.
 * Sekme `origin`'in tek sahibidir: fetcher'da her isteğe eklenir, URL'den
 * okunmaz ve URL'ye yazılmaz (ResourceList sekme değişince yeniden mount olur).
 * Varsayılan sekme URL'ye yazılmaz; sekme geçişi diğer paramları korur →
 * mevcut `?productId=` / `?status=` deep-link'leri çalışmaya devam eder.
 * Başlık → sekmeler → tablo; ikinci bir başlık yok.
 */
const TAB_DEFS: readonly TabDef[] = [
  {
    key: "dogrudan",
    origin: "direct_sale",
    labelKey: "admin.operations.orders.tabs.directSale",
    icon: ShoppingCartIcon,
  },
  {
    key: "teklif",
    origin: "offer",
    labelKey: "admin.operations.orders.tabs.acceptedOffers",
    icon: TagIcon,
  },
];

const DEFAULT_TAB: TabKey = "dogrudan";

function isTabKey(value: string): value is TabKey {
  return TAB_DEFS.some((d) => d.key === value);
}

export default function OrdersPage() {
  const t = useTranslations();
  const [tab, setTab] = useTabParam(DEFAULT_TAB);
  const activeTab: TabKey = isTabKey(tab) ? tab : DEFAULT_TAB;
  const active = TAB_DEFS.find((d) => d.key === activeTab) ?? TAB_DEFS[0];

  // Sekme sayaçları: sekmeden bağımsız toplam (filtre/aramaya bakmaz).
  const counts = useListTotals(
    "orders",
    Object.fromEntries(
      TAB_DEFS.map((d) => [d.key, { origin: d.origin }]),
    ) as Record<TabKey, { origin: OrderOrigin }>,
    adminApi.getOrders,
  );

  return (
    <AdminPage>
      <PageHeader
        title={t("admin.operations.orders.title")}
        description={t("admin.operations.orders.pageDescription")}
      />
      <AdminTabs
        tabs={TAB_DEFS.map((def) => ({
          key: def.key,
          label: `${t(def.labelKey)} (${counts[def.key] ?? "…"})`,
          icon: def.icon,
        }))}
        value={activeTab}
        onChange={setTab}
      />
      <ResourceList
        key={activeTab}
        resource="orders"
        // origin sekmenin sabit parametresi: URL filtresi değil, her isteğe eklenir.
        fetcher={(p) => adminApi.getOrders({ ...p, origin: active.origin })}
        getRowId={(o: any) => o.id}
        syncUrl
        filters={orderFilterFields(t)}
        // userId/productId: ürün ve kullanıcı detayından gelen deep-link
        // filtreleri (kendi kontrolleri yok).
        initialFilters={{ userId: "", productId: "" }}
      >
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
