/** @format */

"use client";

import { useActiveAds } from "@/hooks/useActiveAds";
import AdCreative from "./AdCreative";

/**
 * Ürün ızgarası içindeki afiş: ızgaranın tam genişliğini kaplar (`col-span-full`).
 * Afiş yoksa hiçbir şey çizilmez, ızgara akışı bozulmaz. Listede tek yuva
 * vardır (`isInlineAdSlotAfter`).
 */
export default function InlineAdSlot() {
  const { ads } = useActiveAds("inline");
  // API yuva başına en fazla bir afiş döner.
  const ad = ads[0] ?? null;
  if (!ad) return null;

  return (
    <div className="col-span-full">
      <AdCreative ad={ad} position="inline" />
    </div>
  );
}
