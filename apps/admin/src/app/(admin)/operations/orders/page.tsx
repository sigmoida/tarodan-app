/** @format */

"use client";

import { useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  ClipboardDocumentListIcon,
  TagIcon,
} from "@heroicons/react/24/outline";
import { AdminPage } from "@/components/page/AdminPage";
import { PageHeader } from "@/components/AdminList";
import { AdminTabs } from "@/components/AdminTabs";
import { OrdersTab } from "./_components/OrdersTab";
import { OffersTab } from "./_components/OffersTab";

type TabKey = "siparisler" | "teklifler";

/**
 * Siparişler ve teklifler AYNI route'ta, sekmeyle ayrılır. Varsayılan sekme
 * URL'ye yazılmaz → mevcut `/operations/orders?productId=…` / `?status=…`
 * deep-link'leri aynen çalışır. Sekme geçişi liste parametrelerini düşürür
 * (iki sekme aynı filtre adlarını paylaşır); yalnız aktif sekme mount olur.
 */
const TAB_DEFS = [
  {
    key: "siparisler",
    labelKey: "admin.operations.orders.tabs.orders",
    icon: ClipboardDocumentListIcon,
  },
  {
    key: "teklifler",
    labelKey: "admin.operations.orders.tabs.offers",
    icon: TagIcon,
  },
] as const;

const VALID_TABS = TAB_DEFS.map((t) => t.key) as readonly string[];

export default function OrdersPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const t = useTranslations();

  const urlTab = searchParams.get("tab");
  const activeTab: TabKey = VALID_TABS.includes(urlTab ?? "")
    ? (urlTab as TabKey)
    : "siparisler";

  const handleTabChange = useCallback(
    (key: string) => {
      router.replace(
        key === "siparisler"
          ? "/operations/orders"
          : `/operations/orders?tab=${key}`,
        { scroll: false },
      );
    },
    [router],
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
          label: t(def.labelKey),
          icon: def.icon,
        }))}
        value={activeTab}
        onChange={handleTabChange}
      />
      {activeTab === "siparisler" && <OrdersTab />}
      {activeTab === "teklifler" && <OffersTab />}
    </AdminPage>
  );
}
