"use client";

import {
  resolveAdminOrderBucket,
  resolveAdminOrderTab,
  type AdminOrderBucket,
  type AdminOrderTab,
} from "@tarodan/types";
import { useSearchParams } from "next/navigation";
import { useTabParam } from "@/hooks/useTabParam";
import { defaultOrderBucket } from "../_lib/defaultBucket";

const TAB_OPTIONS = { clearOnChange: ["bucket"] } as const;
// Module-level so `setBucket` keeps its identity across renders.
const BUCKET_OPTIONS = { param: "bucket" } as const;

/**
 * Sekme (`?tab=`) + alt sekme (`?bucket=`) durumu. URL tek kaynaktır: sekme
 * değişince eski sekmenin kovası silinir, yeni sekme varsayılan kovasında
 * açılır — kullanıcı/ürün deep-link'inde "Tümü", değilse "Yeni". Tanınmayan
 * değerler (eski yer imi) varsayılana düşer.
 */
export function useOrderTabs(): {
  tab: AdminOrderTab;
  bucket: AdminOrderBucket;
  setTab: (key: string) => void;
  setBucket: (key: string) => void;
} {
  const searchParams = useSearchParams();
  const [rawTab, setTab] = useTabParam("all", TAB_OPTIONS);
  const tab = resolveAdminOrderTab(rawTab);
  const defaultBucket = defaultOrderBucket(searchParams);
  const [rawBucket, setBucket] = useTabParam(defaultBucket, BUCKET_OPTIONS);
  const bucket = resolveAdminOrderBucket(tab, rawBucket, defaultBucket);
  return { tab, bucket, setTab, setBucket };
}
