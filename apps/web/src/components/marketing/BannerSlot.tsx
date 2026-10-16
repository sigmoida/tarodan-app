/** @format */

"use client";

import { useActiveAds } from "@/hooks/useActiveAds";
import type { AdPosition } from "@/lib/api/advertisements";
import AdCreative from "./AdCreative";

/**
 * Banner yuvası — admin'in tanımladığı afişlerin sayfadaki karşılığı
 * (header: başlık altı, footer: alt bilgi üstü).
 *
 * Yuvada tek afiş vardır (API yuva başına en fazla birini döner). Afiş
 * yoksa hiçbir şey çizilmez (yer ayrılmaz).
 *
 * Aynı yuva platformun KENDİ kampanya duyurusunu da taşır: afiş bir kampanyaya
 * bağlıysa (ör. "komisyonsuz alışveriş") başlığın yanında kupon kodu görünür ve
 * kampanya bitince API afişi zaten döndürmez.
 *
 * Reklamsız katmandaki üyeye çizilmez; karar `useActiveAds` içinde
 * (`useBannerVisibility`), tüm yuvalar için ortak.
 */
export default function BannerSlot({
  position,
  className,
}: {
  position: Extract<AdPosition, "header" | "footer">;
  className?: string;
}) {
  const { ads } = useActiveAds(position);
  const ad = ads[0] ?? null;
  if (!ad) return null;

  return (
    <div className={className}>
      <AdCreative ad={ad} position={position} />
    </div>
  );
}
