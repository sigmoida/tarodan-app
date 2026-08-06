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
 */

export interface NotificationLike {
  link?: string | null;
  data?: { link?: string | null } | null;
}

/** Hedef çözülemezse gidilecek yer — 404 yerine bildirim merkezi. */
export const NOTIFICATION_FALLBACK_HREF = "/profile/notifications";

/** Eski yolların bugünkü karşılıkları (API düzeltmeyi kaçırırsa diye). */
const LEGACY_REWRITES: Array<[RegExp, string]> = [
  [/^\/orders(\/|\?|$)/, "/profile/orders$1"],
  [/^\/offers(\/|\?|$)/, "/profile/offers$1"],
  [/^\/trades(\/|\?|$)/, "/profile/trades$1"],
  [/^\/messages(\/|\?|$)/, "/profile/messages$1"],
  [/^\/products\/unavailable(\/|\?|$)/, "/products/unavailable$1"],
  [/^\/products(\/|\?|$)/, "/listings$1"],
];

export interface ResolvedNotificationHref {
  href: string;
  /** Site dışı hedef: `Link` yerine normal `<a>` ile açılmalı. */
  isExternal: boolean;
  /** Hedef çözülemedi; kart tıklanabilir gösterilmemeli. */
  isFallback: boolean;
}

/**
 * Bildirimin açılacağı hedef.
 *
 * Reddedilenler: çözülmemiş `{{...}}`, `javascript:` ve benzeri şemalar,
 * protokol-göreli (`//host`) ve ayrıştırılamayan adresler. Dış hedef yalnız
 * HTTPS olabilir.
 */
export function resolveNotificationHref(
  notification: NotificationLike | null | undefined,
): ResolvedNotificationHref {
  const raw = notification?.link ?? notification?.data?.link ?? null;
  const fallback = {
    href: NOTIFICATION_FALLBACK_HREF,
    isExternal: false,
    isFallback: true,
  };

  if (typeof raw !== "string") return fallback;
  const trimmed = raw.trim();
  if (!trimmed) return fallback;
  // Sunucu tarafında çözülememiş bir şablon: hedef belirsiz.
  if (trimmed.includes("{{") || trimmed.includes("}}")) return fallback;
  // `//host` protokol-göreli adrestir; iç link sanılıp açılmamalı.
  if (trimmed.startsWith("//")) return fallback;

  if (trimmed.startsWith("/")) {
    for (const [from, to] of LEGACY_REWRITES) {
      if (from.test(trimmed)) {
        return {
          href: trimmed.replace(from, to),
          isExternal: false,
          isFallback: false,
        };
      }
    }
    return { href: trimmed, isExternal: false, isFallback: false };
  }

  // Kalanlar mutlak adres olmalı ve YALNIZ https kabul edilir.
  try {
    const url = new URL(trimmed);
    if (url.protocol !== "https:") return fallback;
    return { href: url.toString(), isExternal: true, isFallback: false };
  } catch {
    return fallback;
  }
}
