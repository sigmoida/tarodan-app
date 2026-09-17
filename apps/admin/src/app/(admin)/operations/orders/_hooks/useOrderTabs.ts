"use client";

import {
  ADMIN_ORDER_TAB_BUCKETS,
  resolveAdminOrderBucket,
  resolveAdminOrderTab,
  type AdminOrderBucket,
  type AdminOrderTab,
} from "@tarodan/types";
import { useTabParam } from "@/hooks/useTabParam";

const TAB_OPTIONS = { clearOnChange: ["bucket"] } as const;
// Module-level so `setBucket` keeps its identity across renders.
const BUCKET_OPTIONS = { param: "bucket" } as const;

/**
 * Sekme (`?tab=`) + alt sekme (`?bucket=`) durumu. URL tek kaynaktır: sekme
 * değişince eski sekmenin kovası silinir, yeni sekme ilk kovasında açılır.
 * Tanınmayan değerler (eski yer imi) varsayılana düşer.
 */
export function useOrderTabs(): {
  tab: AdminOrderTab;
  bucket: AdminOrderBucket;
  setTab: (key: string) => void;
  setBucket: (key: string) => void;
} {
  const [rawTab, setTab] = useTabParam("all", TAB_OPTIONS);
  const tab = resolveAdminOrderTab(rawTab);
  const [rawBucket, setBucket] = useTabParam(
    ADMIN_ORDER_TAB_BUCKETS[tab][0],
    BUCKET_OPTIONS,
  );
  const bucket = resolveAdminOrderBucket(tab, rawBucket);
  return { tab, bucket, setTab, setBucket };
}
