"use client";

import { useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { PageHeader } from "@/components/admin-list";
import { AdminTabs } from "@/components/AdminTabs";
import {
  TruckIcon,
  ArrowsRightLeftIcon,
  ArrowUturnLeftIcon,
} from "@heroicons/react/24/outline";
import { OrderShipmentsTab } from "./OrderShipmentsTab";
import { TradeShipmentsTab } from "./TradeShipmentsTab";
import { ReturnShipmentsTab } from "./ReturnShipmentsTab";

type TabKey = "siparisler" | "takas" | "iade";

const TABS = [
  { key: "siparisler", label: "Siparişler", icon: TruckIcon },
  { key: "takas", label: "Takas", icon: ArrowsRightLeftIcon },
  { key: "iade", label: "İade", icon: ArrowUturnLeftIcon },
] as const;

const VALID_TABS = TABS.map((t) => t.key) as readonly string[];

export default function ShippingPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const urlTab = searchParams.get("tab");
  const activeTab: TabKey = VALID_TABS.includes(urlTab ?? "")
    ? (urlTab as TabKey)
    : "siparisler";

  const handleTabChange = useCallback(
    (key: string) => {
      router.replace(`/shipping?tab=${key}`, { scroll: false });
    },
    [router],
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Kargo İşlemleri"
        description="Tüm kargo işlemleri — sipariş, takas ve iade gönderilerini tek yerden takip edin"
      />

      <AdminTabs
        tabs={TABS.map((t) => ({ key: t.key, label: t.label, icon: t.icon }))}
        value={activeTab}
        onChange={handleTabChange}
      />

      {/* Yalnızca aktif sekme mount olur → tek fetch; react-query queryKey'e göre cache'ler */}
      {activeTab === "siparisler" && <OrderShipmentsTab />}
      {activeTab === "takas" && <TradeShipmentsTab />}
      {activeTab === "iade" && <ReturnShipmentsTab />}
    </div>
  );
}
