"use client";

import {
  ADMIN_CANCELLATION_ALL_BUCKET,
  resolveAdminCancellationBucket,
  resolveAdminCancellationTab,
  type AdminCancellationBucket,
  type AdminCancellationTab,
} from "@tarodan/types";
import { useTabParam } from "@/hooks/useTabParam";

// Module-level so the setters keep their identity across renders.
const TAB_OPTIONS = { clearOnChange: ["bucket"] } as const;
const BUCKET_OPTIONS = { param: "bucket" } as const;

/**
 * İptaller sekmesi (`?tab=`) + alt sekmesi (`?bucket=`). URL tek kaynaktır:
 * sekme değişince eski sekmenin alt sekmesi silinir, yeni sekme "Tümü"nde
 * açılır. Tanınmayan değerler (eski yer imi) varsayılana düşer.
 */
export function useCancellationTabs(): {
  tab: AdminCancellationTab;
  bucket: AdminCancellationBucket;
  setTab: (key: string) => void;
  setBucket: (key: string) => void;
} {
  const [rawTab, setTab] = useTabParam("all", TAB_OPTIONS);
  const [rawBucket, setBucket] = useTabParam(
    ADMIN_CANCELLATION_ALL_BUCKET,
    BUCKET_OPTIONS,
  );
  return {
    tab: resolveAdminCancellationTab(rawTab),
    bucket: resolveAdminCancellationBucket(rawBucket),
    setTab,
    setBucket,
  };
}
