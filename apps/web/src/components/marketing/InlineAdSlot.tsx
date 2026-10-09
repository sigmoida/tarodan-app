/** @format */

"use client";

import { useActiveAds } from "@/hooks/useActiveAds";
import { pickAd } from "@/lib/ads/pickAd";
import AdCreative from "./AdCreative";

/**
 * Ürün ızgarası içindeki afiş: ızgaranın tam genişliğini kaplar (`col-span-full`).
 * Afiş yoksa hiçbir şey çizilmez, ızgara akışı bozulmaz. `slot` yuvanın sırasıdır;
 * her yuva kendi anahtarıyla seçtiği için art arda farklı afişler çıkabilir.
 */
export default function InlineAdSlot({ slot }: { slot: number }) {
  const { ads } = useActiveAds("inline");
  const ad = pickAd(ads, `inline-${slot}`);
  if (!ad) return null;

  return (
    <div className="col-span-full">
      <AdCreative ad={ad} position="inline" />
    </div>
  );
}
