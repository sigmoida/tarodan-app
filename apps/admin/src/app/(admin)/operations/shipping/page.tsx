"use client";

import { useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { AdminPage } from "@/components/page/AdminPage";
import { PageHeader } from "@/components/AdminList";
import { AdminTabs } from "@/components/AdminTabs";
import {
  TruckIcon,
  ArrowsRightLeftIcon,
  ArrowUturnLeftIcon,
  MapPinIcon,
} from "@heroicons/react/24/outline";
import { OrderShipmentsTab } from "./OrderShipmentsTab";
import { TradeShipmentsTab } from "./TradeShipmentsTab";
import { ReturnShipmentsTab } from "./ReturnShipmentsTab";
import { SuratTrackingTab } from "./SuratTrackingTab";

type TabKey = "siparisler" | "takas" | "iade" | "surat";

const TAB_DEFS = [
  {
    key: "siparisler",
    labelKey: "admin.operations.shipping.tabs.orders",
    icon: TruckIcon,
  },
  {
    key: "takas",
    labelKey: "admin.operations.shipping.tabs.trades",
    icon: ArrowsRightLeftIcon,
  },
  {
    key: "iade",
    labelKey: "admin.operations.shipping.tabs.returns",
    icon: ArrowUturnLeftIcon,
  },
  {
    key: "surat",
    labelKey: "admin.operations.shipping.tabs.surat",
    icon: MapPinIcon,
  },
] as const;

const VALID_TABS = TAB_DEFS.map((t) => t.key) as readonly string[];

export default function ShippingPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const t = useTranslations();

  const urlTab = searchParams.get("tab");
  const activeTab: TabKey = VALID_TABS.includes(urlTab ?? "")
    ? (urlTab as TabKey)
    : "siparisler";

  const handleTabChange = useCallback(
    (key: string) => {
      router.replace(`/operations/shipping?tab=${key}`, { scroll: false });
    },
    [router],
  );

  return (
    <AdminPage>
      <PageHeader
        title={t("admin.operations.shipping.title")}
        description={t("admin.operations.shipping.description")}
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

      {/* Only the active tab mounts → single fetch; react-query caches by queryKey */}
      {activeTab === "siparisler" && <OrderShipmentsTab />}
      {activeTab === "takas" && <TradeShipmentsTab />}
      {activeTab === "iade" && <ReturnShipmentsTab />}
      {activeTab === "surat" && <SuratTrackingTab />}
    </AdminPage>
  );
}
