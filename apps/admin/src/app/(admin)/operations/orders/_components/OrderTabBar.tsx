"use client";

import { type ComponentType } from "react";
import { useTranslations } from "next-intl";
import {
  QueueListIcon,
  ShoppingCartIcon,
  TagIcon,
} from "@heroicons/react/24/outline";
import {
  ADMIN_ORDER_BUCKET_I18N_KEYS,
  ADMIN_ORDER_TABS,
  ADMIN_ORDER_TAB_BUCKETS,
  ADMIN_ORDER_TAB_I18N_KEYS,
  type AdminOrderTab,
} from "@tarodan/types";
import { AdminTabs } from "@/components/AdminTabs";
import { useOrderTabs } from "../_hooks/useOrderTabs";
import { useOrderCounts } from "../_hooks/useOrderCounts";

const TAB_ICONS: Record<
  AdminOrderTab,
  ComponentType<{ className?: string }>
> = {
  all: QueueListIcon,
  direct_sale: ShoppingCartIcon,
  offer: TagIcon,
};

const PENDING = "…";

/**
 * İki seviyeli sekme çubuğu: sekmeler (Tüm / Direkt Satış / Teklifler) ve
 * seçili sekmenin alt sekmeleri (kovalar). Rozetler tek sayaç isteğinden gelir
 * ve listenin filtrelerini yansıtır. Liste bağlamı içinde render edilir.
 */
export function OrderTabBar() {
  const t = useTranslations();
  const { tab, bucket, setTab, setBucket } = useOrderTabs();
  const counts = useOrderCounts();

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <AdminTabs
        tabs={ADMIN_ORDER_TABS.map((key) => ({
          key,
          label: t(ADMIN_ORDER_TAB_I18N_KEYS[key]),
          icon: TAB_ICONS[key],
          badge: counts?.[key].total ?? PENDING,
        }))}
        value={tab}
        onChange={setTab}
      />
      <AdminTabs
        tabs={ADMIN_ORDER_TAB_BUCKETS[tab].map((key) => ({
          key,
          label: t(ADMIN_ORDER_BUCKET_I18N_KEYS[key]),
          badge: counts?.[tab].buckets[key] ?? PENDING,
        }))}
        value={bucket}
        onChange={setBucket}
      />
    </div>
  );
}
