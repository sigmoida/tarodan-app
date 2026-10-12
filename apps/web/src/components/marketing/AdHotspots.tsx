/** @format */

"use client";

import { Link } from "@/i18n/navigation";
import { trackAdEvent, type Advertisement } from "@/lib/api/advertisements";
import { hotspotStyle, renderableHotspots } from "@/lib/ads/hotspots";
import { isExternalAdHref } from "@/lib/ads/safeAdHref";

const HOTSPOT_CLASS =
  "absolute block cursor-pointer rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary-600";

/**
 * Görsel afişin tıklanabilir bölgeleri — TEK çizim yeri (header/footer/inline/
 * popup yuvaları ve üst şerit). Görselin üstüne, `relative` bir kutu içinde
 * yüzdeyle konumlanan görünmez bağlantılar koyar; görselin geri kalanı
 * bağlantı DEĞİLDİR. Çizilecek bölge yoksa hiçbir şey çizmez.
 */
export default function AdHotspots({
  ad,
  onNavigate,
}: {
  ad: Pick<Advertisement, "id" | "imageUrl" | "hotspots">;
  /** Tıklamadan sonra (ör. popup'ı kapatmak için). */
  onNavigate?: () => void;
}) {
  const items = renderableHotspots(ad);
  if (items.length === 0) return null;

  return (
    <>
      {items.map(({ hotspot, href }) => {
        const common = {
          href,
          "aria-label": hotspot.label,
          style: hotspotStyle(hotspot),
          className: HOTSPOT_CLASS,
          onClick: () => {
            trackAdEvent(ad.id, "click", hotspot.id);
            onNavigate?.();
          },
        };
        return isExternalAdHref(href) ? (
          <a
            key={hotspot.id}
            {...common}
            target="_blank"
            rel="sponsored noopener noreferrer"
          />
        ) : (
          <Link key={hotspot.id} {...common} rel="sponsored" />
        );
      })}
    </>
  );
}
