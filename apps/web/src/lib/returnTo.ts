/** @format */

import { locales } from "@tarodan/i18n";

/**
 * Middleware'in her isteğe yazdığı "locale'siz yol + query" başlığı. Layout'lar
 * `searchParams` göremediği için, sunucu tarafı giriş yönlendirmesi (ör. profil
 * layout'u) kullanıcının geldiği tam adresi buradan okur.
 */
export const RETURN_TO_HEADER = "x-return-to";

/**
 * Başlığı OKUYAN yollar (locale'siz): şimdilik yalnız profil layout'u. Başlık
 * yalnız burada yazılır; yeni bir layout okumaya başlarsa buraya eklenmeli.
 */
export function readsReturnToHeader(path: string): boolean {
  return /^\/profile(\/|$)/.test(path);
}

/** Başta `/en`, `/tr` … gibi bir locale segmenti (ardından `/`, `?`, `#` ya da son). */
const LOCALE_PREFIX = new RegExp(`^/(?:${locales.join("|")})(?=[/?#]|$)`);

/**
 * Locale önekini atar (`/en/listings/new` → `/listings/new`, `/en` → `/`).
 * next-intl router öneki kendisi ekler; öneki bırakırsak `/en/en/...` olur.
 * Tekrarlı önekler (`/en/en/x`) de tek seferde temizlenir.
 */
function stripLocalePrefix(path: string): string {
  let out = path;
  while (LOCALE_PREFIX.test(out)) {
    out = out.replace(LOCALE_PREFIX, "");
    if (!out.startsWith("/")) out = `/${out}`;
  }
  return out;
}

/**
 * `returnTo` yalnızca site içi bir yol olabilir: `/` ile başlar, `//` ile
 * (protokol-göreli) başlamaz, ters bölü ya da kontrol karakteri taşımaz.
 * Aksi halde açık yönlendirme açığı olur; geçersizse `null` döner.
 *
 * Başındaki locale öneki atılır; doğrulama önek atıldıktan SONRA yapılır
 * (`/en//evil.com` → `//evil.com` reddedilmeli).
 */
export function safeReturnTo(value: string | null | undefined): string | null {
  if (!value || !value.startsWith("/")) return null;
  const path = stripLocalePrefix(value);
  if (path.startsWith("//")) return null;
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f\\]/.test(path)) return null;
  return path;
}

/** Bir sayfaya "ekle, sonra geri dön" linki: `/profile?returnTo=/listings/new`. */
export function withReturnTo(href: string, returnTo: string): string {
  const sep = href.includes("?") ? "&" : "?";
  return `${href}${sep}returnTo=${encodeURIComponent(returnTo)}`;
}

/**
 * Girişten sonra `target`'a dönecek login adresi. Hedef güvenli değilse
 * `redirect` hiç eklenmez (login sonrası ana sayfa).
 */
export function loginHref(target: string | null | undefined): string {
  const safe = safeReturnTo(target);
  return safe ? `/login?redirect=${encodeURIComponent(safe)}` : "/login";
}
