/** @format */

/**
 * Bildirimin tıklanabilir hedefi — web tarafındaki TEK karar noktası.
 *
 * Zil ve bildirim merkezi ayrı ayrı `notification.link || data.link` sonucunu
 * doğrudan navigasyona veriyordu. Ham alan güvenilir değil: veritabanında
 * `{{orderId}}` içeren, `/orders/:id` gibi artık var olmayan ve dışarıdan
 * gelmiş serbest linkler duruyor. Doğrulanmadan açıldığında kullanıcı 404'e
 * ya da site dışına gidiyordu.
 *
 * API artık hedefi tip+data'dan yeniden çözüyor; bu yardımcı istemci tarafının
 * son savunması ve iki ekranın AYNI hedefi açmasının garantisi.
 *
 * The allowed in-site paths come from `@tarodan/types`
 * (`NOTIFICATION_INTERNAL_PATHS`), the list the API and the admin broadcast
 * form validate with, so a new notification target is added in one place.
 */

import { NOTIFICATION_INTERNAL_PATHS } from "@tarodan/types";

export interface NotificationLike {
  link?: string | null;
  data?: { link?: string | null } | null;
}

/** Hedef çözülemezse gidilecek yer — 404 yerine bildirim merkezi. */
export const NOTIFICATION_FALLBACK_HREF = "/profile/notifications";

/**
 * Doğrulamanın referans origin'i. Gerçek adres önemli değil; göreli yolun
 * BAŞKA bir origin'e kaçmadığını ölçmek için sabit bir tabana çözülür.
 */
const REFERENCE_ORIGIN = "https://tarodan.internal";

/** Eski yolların bugünkü karşılıkları (API düzeltmeyi kaçırırsa diye). */
const LEGACY_REWRITES: Array<[RegExp, string]> = [
  [/^\/orders(\/|\?|$)/, "/profile/orders$1"],
  [/^\/offers(\/|\?|$)/, "/profile/offers$1"],
  [/^\/trades(\/|\?|$)/, "/profile/trades$1"],
  [/^\/messages(\/|\?|$)/, "/profile/messages$1"],
  [/^\/products\/unavailable(\/|\?|$)/, "/products/unavailable$1"],
  [/^\/products(\/|\?|$)/, "/listings$1"],
];

/**
 * Ters bölü ve kontrol karakterleri tarayıcıda farklı çözülür.
 *
 * Kod noktası kontrolü tercih edildi: kontrol karakterlerini düzenli ifadeye
 * gömmek hem okunmaz hem de lint tarafından yasak (`no-control-regex`).
 */
const hasUnsafeChar = (value: string): boolean =>
  [...value].some((char) => {
    const code = char.charCodeAt(0);
    return char === "\\" || code < 0x20 || code === 0x7f;
  });

export interface ResolvedNotificationHref {
  href: string;
  /** Site dışı hedef: `Link` yerine normal `<a>` ile açılmalı. */
  isExternal: boolean;
  /** Hedef çözülemedi; kart tıklanabilir gösterilmemeli. */
  isFallback: boolean;
}

const FALLBACK: ResolvedNotificationHref = {
  href: NOTIFICATION_FALLBACK_HREF,
  isExternal: false,
  isFallback: true,
};

/** Eski yol bugünkü karşılığına çevrilir; eşleşme yoksa olduğu gibi kalır. */
function rewriteLegacyPath(path: string): string {
  for (const [from, to] of LEGACY_REWRITES) {
    if (from.test(path)) return path.replace(from, to);
  }
  return path;
}

/**
 * Bildirimin açılacağı hedef.
 *
 * Reddedilenler: çözülmemiş `{{...}}`, `javascript:` ve benzeri şemalar,
 * protokol-göreli (`//host`), ters bölü ile origin'den kaçan (`/\evil/x`),
 * kontrol karakteri taşıyan, ayrıştırılamayan ve sitede KARŞILIĞI OLMAYAN
 * yollar. Dış hedef yalnız HTTPS olabilir.
 */
export function resolveNotificationHref(
  notification: NotificationLike | null | undefined,
): ResolvedNotificationHref {
  const raw = notification?.link ?? notification?.data?.link ?? null;

  if (typeof raw !== "string") return FALLBACK;
  const trimmed = raw.trim();
  if (!trimmed) return FALLBACK;
  // Sunucu tarafında çözülememiş bir şablon: hedef belirsiz.
  if (trimmed.includes("{{") || trimmed.includes("}}")) return FALLBACK;
  // Ters bölü / kontrol karakteri origin kaçışının aracı olabiliyor.
  if (hasUnsafeChar(trimmed)) return FALLBACK;
  // `//host` protokol-göreli adrestir; iç link sanılıp açılmamalı.
  if (trimmed.startsWith("//")) return FALLBACK;

  if (trimmed.startsWith("/")) {
    const rewritten = rewriteLegacyPath(trimmed);

    let url: URL;
    try {
      url = new URL(rewritten, REFERENCE_ORIGIN);
    } catch {
      return FALLBACK;
    }
    // Göreli çözüm başka bir origin'e kaçtıysa iç link değildir.
    if (url.origin !== REFERENCE_ORIGIN) return FALLBACK;
    // Canonical paths without the locale prefix (`@/i18n/navigation` adds it).
    if (
      !NOTIFICATION_INTERNAL_PATHS.some((route) => route.test(url.pathname))
    ) {
      return FALLBACK;
    }

    return { href: rewritten, isExternal: false, isFallback: false };
  }

  // Kalanlar mutlak adres olmalı ve YALNIZ https kabul edilir.
  try {
    const url = new URL(trimmed);
    if (url.protocol !== "https:") return FALLBACK;
    return { href: url.toString(), isExternal: true, isFallback: false };
  } catch {
    return FALLBACK;
  }
}
