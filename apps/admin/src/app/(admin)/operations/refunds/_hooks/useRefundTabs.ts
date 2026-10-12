"use client";

import type { AdminRefundBucket, AdminRefundTab } from "@tarodan/types";
import { useTabParam } from "@/hooks/useTabParam";
import {
  DEFAULT_REFUND_BUCKET,
  DEFAULT_REFUND_TAB,
  REFUND_BUCKET_PARAM,
  REFUND_TAB_SCOPED_PARAMS,
  resolveRefundBucket,
  resolveRefundTab,
} from "../_lib/screenTabs";

// Module-level so the setters keep their identity across renders.
const TAB_OPTIONS = { clearOnChange: REFUND_TAB_SCOPED_PARAMS } as const;
const BUCKET_OPTIONS = { param: REFUND_BUCKET_PARAM } as const;

/**
 * İadeler ekranının üst sekmesi (`?tab=`) + alt sekmesi (`?bucket=`). URL tek
 * kaynaktır: üst sekme değişince alt sekme silinir, yeni sekme "Tümü"nde
 * açılır. Tanınmayan değerler (eski yer imi) varsayılana düşer.
 */
export function useRefundTabs(): {
  tab: AdminRefundTab;
  bucket: AdminRefundBucket;
  setTab: (key: string) => void;
  setBucket: (key: string) => void;
} {
  const [rawTab, setTab] = useTabParam(DEFAULT_REFUND_TAB, TAB_OPTIONS);
  const [rawBucket, setBucket] = useTabParam(
    DEFAULT_REFUND_BUCKET,
    BUCKET_OPTIONS,
  );
  return {
    tab: resolveRefundTab(rawTab),
    bucket: resolveRefundBucket(rawBucket),
    setTab,
    setBucket,
  };
}
