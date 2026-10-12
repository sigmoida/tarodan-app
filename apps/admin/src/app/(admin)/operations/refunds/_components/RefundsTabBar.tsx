"use client";

import { useTranslations } from "next-intl";
import {
  ADMIN_REFUND_BUCKETS,
  ADMIN_REFUND_BUCKET_I18N_KEYS,
  ADMIN_REFUND_TABS,
  ADMIN_REFUND_TAB_I18N_KEYS,
} from "@tarodan/types";
import { AdminTabs } from "@/components/AdminTabs";
import { useRefundTabs } from "../_hooks/useRefundTabs";
import { useRefundCounts } from "../_hooks/useRefundCounts";

const PENDING = "…";

/**
 * İki seviyeli sekme çubuğu: üst sekmeler (Tüm İadeler / Direk Satış / Teklif /
 * Takas) ve seçili sekmenin durum alt sekmeleri. Alt sekme rozetleri tek sayaç
 * isteğinden gelir ve listenin arama + filtrelerini yansıtır; liste bağlamı
 * içinde render edilir.
 */
export function RefundsTabBar() {
  const t = useTranslations();
  const { tab, bucket, setTab, setBucket } = useRefundTabs();
  const counts = useRefundCounts(tab);

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <AdminTabs
        tabs={ADMIN_REFUND_TABS.map((key) => ({
          key,
          label: t(ADMIN_REFUND_TAB_I18N_KEYS[key]),
        }))}
        value={tab}
        onChange={setTab}
      />
      <AdminTabs
        tabs={ADMIN_REFUND_BUCKETS.map((key) => ({
          key,
          label: t(ADMIN_REFUND_BUCKET_I18N_KEYS[key]),
          badge: counts?.[key] ?? PENDING,
        }))}
        value={bucket}
        onChange={setBucket}
      />
    </div>
  );
}
