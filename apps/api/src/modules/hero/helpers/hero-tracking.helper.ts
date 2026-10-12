import type { HeroCtaSlot } from "@tarodan/types";
import type { BeaconTrackingKind } from "../../../common/helpers/beacon-tracking";

/**
 * Hero tık/gösterim sayımı — tekilleştirme anahtarı ve `?cta=` okuması.
 * Pencereler ve hız sınırı reklamla ortaktır (`common/helpers/beacon-tracking`).
 */

/**
 * Anahtar slayt, buton ve IP'yi ayrı segmentlerde taşır: aynı ziyaretçinin
 * aynı slayttaki iki farklı butona art arda tıkı iki tıktır.
 */
export function heroTrackingDedupeKey(
  kind: BeaconTrackingKind,
  slideId: string,
  clientIp: string,
  cta?: HeroCtaSlot,
): string {
  const target = cta ? `${slideId}:cta${cta}` : slideId;
  return `hero:dedupe:${kind}:${target}:${clientIp}`;
}

/**
 * Ham `?cta=` değeri:
 *  - yok / boş → `undefined` (slaydın kendisine, görsele tık),
 *  - "1" / "2" → buton sırası,
 *  - başka her şey (dizi, "3", "abc") → `null` = geçersiz; istek sayılmadan
 *    yok sayılır (beacon hatayı okuyamaz, 400 yalnız yoklamaya yarardı).
 */
export function parseHeroCtaParam(
  raw: unknown,
): HeroCtaSlot | undefined | null {
  if (raw === undefined || raw === "") return undefined;
  if (raw === "1" || raw === 1) return 1;
  if (raw === "2" || raw === 2) return 2;
  return null;
}
