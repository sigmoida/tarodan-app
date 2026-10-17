import { clientIpThrottleTracker } from "./client-ip";

/**
 * Vitrin içeriği tık/gösterim sayımı — tekilleştirme pencereleri ve hız
 * sınırı, TEK tanım. Reklam (`/ads/:id/*`) ve hero slaytı
 * (`/hero-slides/:id/*`) aynı pencere ve aynı tavanla sayılır; iki modülde
 * ayrı yazılan sayılar istatistikleri kıyaslanamaz kılardı.
 *
 * Uçlar herkese açık ve `navigator.sendBeacon` ile çağrılır; koruma olmadan
 * aynı sekmede yenileme ya da elle döngü sayaçları istediği kadar şişirirdi
 * (DSC-104). Pencere boyunca aynı IP + aynı hedef bir kez sayılır.
 */
export const BEACON_DEDUPE_SECONDS = {
  /** Aynı ziyaretçi aynı içeriği yarım saat içinde tekrar görürse sayılmaz. */
  impression: 30 * 60,
  /** Çift tık / hızlı tekrar tık tek tık sayılır. */
  click: 10,
} as const;

export type BeaconTrackingKind = keyof typeof BEACON_DEDUPE_SECONDS;

/** İstemci IP'si başına dakikalık istek tavanı (her uç ayrı ayrı). */
export const BEACON_TRACKING_LIMIT = { limit: 60, ttl: 60_000 } as const;

/**
 * `@Throttle(...)` seçeneği. Kova istemci IP'sidir: web gateway trafiği tek
 * web sunucusu IP'sinden gelir, `req.ip` kovası bütün ziyaretçileri tek kovaya
 * kilitlerdi.
 */
export const BEACON_TRACKING_THROTTLE = {
  default: { ...BEACON_TRACKING_LIMIT, getTracker: clientIpThrottleTracker },
};
