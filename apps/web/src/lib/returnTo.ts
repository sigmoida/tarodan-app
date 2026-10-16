/** @format */

/**
 * `returnTo` yalnızca site içi bir yol olabilir: `/` ile başlar, `//` ile
 * (protokol-göreli) ya da `/\` ile başlamaz, kontrol karakteri taşımaz.
 * Aksi halde açık yönlendirme açığı olur; geçersizse `null` döner.
 */
export function safeReturnTo(value: string | null | undefined): string | null {
  if (!value || !value.startsWith("/")) return null;
  if (value.startsWith("//") || value.startsWith("/\\")) return null;
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f\\]/.test(value)) return null;
  return value;
}

/** Bir sayfaya "ekle, sonra geri dön" linki: `/profile?returnTo=/listings/new`. */
export function withReturnTo(href: string, returnTo: string): string {
  const sep = href.includes("?") ? "&" : "?";
  return `${href}${sep}returnTo=${encodeURIComponent(returnTo)}`;
}

/** Geçerli URL'deki güvenli `returnTo` (yalnız istemcide; yoksa/güvensizse null). */
export function readReturnTo(): string | null {
  if (typeof window === "undefined") return null;
  return safeReturnTo(
    new URLSearchParams(window.location.search).get("returnTo"),
  );
}
