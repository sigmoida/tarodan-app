/** @format */

"use client";

import { useActiveAds } from "@/hooks/useActiveAds";
import type { AdPosition } from "@/lib/api/advertisements";
import { pickAd } from "@/lib/ads/pickAd";
import AdCreative from "./AdCreative";

/**
 * Banner yuvası — admin'in tanımladığı afişlerin sayfadaki karşılığı
 * (header: başlık altı, footer: alt bilgi üstü).
 *
 * Konumdaki afişlerden TEK biri gösterilir; dönüşüm `pickAd` ile sayfa
 * yüklemesi başına değişir. Afiş yoksa hiçbir şey çizilmez (yer ayrılmaz).
 *
 * Aynı yuva platformun KENDİ kampanya duyurusunu da taşır: afiş bir kampanyaya
 * bağlıysa (ör. "komisyonsuz alışveriş") başlığın yanında kupon kodu görünür ve
 * kampanya bitince API afişi zaten döndürmez.
 *
 * Banner herkese gösterilir; üyeliğe bağlı bir gizleme kuralı YOKTUR.
 */
export default function BannerSlot({
  position,
  className,
}: {
  position: Extract<AdPosition, "header" | "footer">;
  className?: string;
}) {
  const { ads } = useActiveAds(position);
  const ad = pickAd(ads, position);
  if (!ad) return null;

  return (
    <div className={className}>
      <AdCreative ad={ad} position={position} />
    </div>
  );
}
