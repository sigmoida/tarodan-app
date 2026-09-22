"use client";

import {
  resolveAdminOrderBucket,
  type AdminOrderBucket,
  type AdminOrderTab,
} from "@tarodan/types";
import { useSearchParams } from "next/navigation";
import { useTabParam } from "@/hooks/useTabParam";
import { defaultOrderBucket } from "../_lib/defaultBucket";

// Module-level so `setBucket` keeps its identity across renders.
const BUCKET_OPTIONS = { param: "bucket" } as const;

/**
 * Sipariş sekmesinin alt sekmesi (`?bucket=`). URL tek kaynaktır: üst sekme
 * değişince kova silinir (`ORDERS_TAB_SCOPED_PARAMS`), yeni sekme varsayılan
 * kovasında açılır — kullanıcı/ürün deep-link'inde "Tümü", değilse "Yeni".
 * Tanınmayan değerler (eski yer imi, kaldırılan teklif kovaları) varsayılana
 * düşer.
 */
export function useOrderBucket(tab: AdminOrderTab): {
  bucket: AdminOrderBucket;
  setBucket: (key: string) => void;
} {
  const searchParams = useSearchParams();
  const defaultBucket = defaultOrderBucket(searchParams);
  const [rawBucket, setBucket] = useTabParam(defaultBucket, BUCKET_OPTIONS);
  const bucket = resolveAdminOrderBucket(tab, rawBucket, defaultBucket);
  return { bucket, setBucket };
}
