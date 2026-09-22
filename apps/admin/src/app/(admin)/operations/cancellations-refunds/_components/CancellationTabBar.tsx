"use client";

import { type ComponentType } from "react";
import { useTranslations } from "next-intl";
import {
  ArrowsRightLeftIcon,
  QueueListIcon,
  ShoppingCartIcon,
  TagIcon,
} from "@heroicons/react/24/outline";
import {
  ADMIN_CANCELLATION_BUCKETS,
  ADMIN_CANCELLATION_BUCKET_I18N_KEYS,
  ADMIN_CANCELLATION_TABS,
  ADMIN_CANCELLATION_TAB_I18N_KEYS,
  type AdminCancellationTab,
} from "@tarodan/types";
import { AdminTabs } from "@/components/AdminTabs";
import { useCancellationTabs } from "../_hooks/useCancellationTabs";
import { useCancellationCounts } from "../_hooks/useCancellationCounts";

const TAB_ICONS: Record<
  AdminCancellationTab,
  ComponentType<{ className?: string }>
> = {
  all: QueueListIcon,
  direct_sale: ShoppingCartIcon,
  offer: TagIcon,
  trade: ArrowsRightLeftIcon,
};

const PENDING = "…";

/**
 * İki seviyeli sekme çubuğu: sekmeler (Tüm İptaller / Direkt Satış /
 * Teklifler / Takaslar) ve seçili sekmenin alt sekmeleri. Rozetler tek sayaç
 * isteğinden gelir ve listenin filtrelerini yansıtır.
 */
export function CancellationTabBar() {
  const t = useTranslations();
  const { tab, bucket, setTab, setBucket } = useCancellationTabs();
  const counts = useCancellationCounts();

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <AdminTabs
        tabs={ADMIN_CANCELLATION_TABS.map((key) => ({
          key,
          label: t(ADMIN_CANCELLATION_TAB_I18N_KEYS[key]),
          icon: TAB_ICONS[key],
          badge: counts?.[key].total ?? PENDING,
        }))}
        value={tab}
        onChange={setTab}
      />
      <AdminTabs
        tabs={ADMIN_CANCELLATION_BUCKETS.map((key) => ({
          key,
          label: t(ADMIN_CANCELLATION_BUCKET_I18N_KEYS[key]),
          badge: counts?.[tab].buckets[key] ?? PENDING,
        }))}
        value={bucket}
        onChange={setBucket}
      />
    </div>
  );
}
