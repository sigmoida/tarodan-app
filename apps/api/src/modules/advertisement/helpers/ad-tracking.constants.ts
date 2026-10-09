/**
 * Reklam tık/gösterim sayımı — tekilleştirme pencereleri ve hız sınırı.
 *
 * Uçlar herkese açık ve `navigator.sendBeacon` ile çağrılır; koruma olmadan
 * aynı sekmede yenileme ya da elle döngü sayaçları istediği kadar şişirirdi
 * (DSC-104). Pencere boyunca aynı IP + aynı reklam bir kez sayılır.
 */
export const AD_TRACKING_DEDUPE_SECONDS = {
  /** Aynı ziyaretçi aynı reklamı yarım saat içinde tekrar görürse sayılmaz. */
  impression: 30 * 60,
  /** Çift tık / hızlı tekrar tık tek tık sayılır. */
  click: 10,
} as const;

export type AdTrackingKind = keyof typeof AD_TRACKING_DEDUPE_SECONDS;

/** İstemci IP'si başına dakikalık istek tavanı (iki uç ayrı ayrı). */
export const AD_TRACKING_THROTTLE = { limit: 60, ttl: 60_000 } as const;

/** Tekilleştirme anahtarı — reklam ve IP ayrı segmentlerde. */
export function adTrackingDedupeKey(
  kind: AdTrackingKind,
  adId: string,
  clientIp: string,
): string {
  return `ads:dedupe:${kind}:${adId}:${clientIp}`;
}
