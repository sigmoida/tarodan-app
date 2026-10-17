/** @format */

import type { AdHotspot, Advertisement } from "@/lib/api/advertisements";
import { safeAdHref } from "./safeAdHref";

/** Güvenli bağlantısı çözülmüş, çizilmeye hazır bölge. */
export interface RenderableHotspot {
  hotspot: AdHotspot;
  href: string;
}

/** Oranları (0–1) görsel kutusuna göre yüzde konumlandırmaya çevirir. */
export function hotspotStyle(
  h: Pick<AdHotspot, "x" | "y" | "width" | "height">,
) {
  return {
    left: `${h.x * 100}%`,
    top: `${h.y * 100}%`,
    width: `${h.width * 100}%`,
    height: `${h.height * 100}%`,
  };
}

/**
 * Çizilecek bölgeler: bağlantısı güvenli olmayan (`safeAdHref` → null)
 * bölge atlanır. Görselsiz afişte bölge yoktur (tek `linkUrl` kullanılır).
 */
export function renderableHotspots(
  ad: Pick<Advertisement, "imageUrl" | "hotspots">,
): RenderableHotspot[] {
  if (!ad.imageUrl) return [];
  const result: RenderableHotspot[] = [];
  for (const hotspot of ad.hotspots ?? []) {
    const href = safeAdHref(hotspot.linkUrl);
    if (href) result.push({ hotspot, href });
  }
  return result;
}

/**
 * Popup: TEK bölgeli görselli afişte görselin tamamı o bölgenin bağlantısıdır
 * (küçük bir alanı aramak gerekmesin); tık yine o bölgenin kimliğiyle sayılır.
 * Birden çok bölgede (ya da hiç yoksa) afiş olduğu gibi kalır.
 */
export function withSoleHotspotExpanded<
  T extends Pick<Advertisement, "imageUrl" | "hotspots">,
>(ad: T): T {
  if (!ad.imageUrl || ad.hotspots?.length !== 1) return ad;
  const [only] = ad.hotspots;
  return { ...ad, hotspots: [{ ...only, x: 0, y: 0, width: 1, height: 1 }] };
}
