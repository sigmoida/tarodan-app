"use client";

import { useTranslations } from "next-intl";
import {
  ADMIN_ORDER_BUCKET_I18N_KEYS,
  ADMIN_ORDER_TAB_BUCKETS,
  type AdminOrderTab,
} from "@tarodan/types";
import { AdminTabs } from "@/components/AdminTabs";
import { useOrderBucket } from "../_hooks/useOrderBucket";
import { useOrderCounts } from "../_hooks/useOrderCounts";

const PENDING = "…";

/**
 * Sipariş sekmesinin alt sekmeleri (kovalar). Rozetler üst sekmelerle AYNI
 * sayaç isteğinden gelir ve listenin filtrelerini yansıtır. Liste bağlamı
 * içinde render edilir.
 */
export function OrderBucketBar({ tab }: { tab: AdminOrderTab }) {
  const t = useTranslations();
  const { bucket, setBucket } = useOrderBucket(tab);
  const counts = useOrderCounts(true);

  return (
    <AdminTabs
      tabs={ADMIN_ORDER_TAB_BUCKETS[tab].map((key) => ({
        key,
        label: t(ADMIN_ORDER_BUCKET_I18N_KEYS[key]),
        badge: counts?.[tab].buckets[key] ?? PENDING,
      }))}
      value={bucket}
      onChange={setBucket}
    />
  );
}
