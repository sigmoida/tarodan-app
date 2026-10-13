/** @format */

"use client";

import { useActiveAds } from "@/hooks/useActiveAds";
import { useBannerVisibility } from "@/hooks/useBannerVisibility";
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
 * Reklamsız katmandaki (admin → Üyelik Katmanları → "reklamsız") üyeye çizilmez;
 * karar `useBannerVisibility`te. Misafir ve diğer katmanlar banner görür.
 */
export default function BannerSlot({
  position,
  className,
}: {
  position: Extract<AdPosition, "header" | "footer">;
  className?: string;
}) {
  const visible = useBannerVisibility();
  // Reklamsız üyede afiş isteği de atılmaz.
  const { ads } = useActiveAds(position, visible);
  const ad = visible ? pickAd(ads, position) : null;
  if (!ad) return null;

  return (
    <div className={className}>
      <AdCreative ad={ad} position={position} />
    </div>
  );
}
