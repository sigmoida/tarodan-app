/** @format */

import { listingPath, type ListingUrlSource } from "@tarodan/types";

/**
 * Paylaşım için tek kaynak: sosyal ağ linkleri, kanonik paylaşım URL'leri,
 * panoya kopyalama ve pencere açma. `ShareMenu` ve çağıranlar buradan okur;
 * ilan/koleksiyon/favoriler için ayrı kopyalar tutulmaz.
 */

export type ShareTarget = "whatsapp" | "x" | "facebook" | "telegram";

/** Menüde görünme sırası. */
export const SHARE_TARGETS: readonly ShareTarget[] = [
  "whatsapp",
  "x",
  "facebook",
  "telegram",
];

/** Her ağın paylaşım (intent) linki; metin ve URL encodeURIComponent'li. */
export function buildShareTargets({
  url,
  text = "",
}: {
  url: string;
  text?: string;
}): Record<ShareTarget, string> {
  const u = encodeURIComponent(url);
  const tx = encodeURIComponent(text);
  return {
    whatsapp: `https://wa.me/?text=${encodeURIComponent(
      text ? `${text} ${url}` : url,
    )}`,
    x: `https://x.com/intent/post?text=${tx}&url=${u}`,
    facebook: `https://www.facebook.com/sharer/sharer.php?u=${u}`,
    telegram: `https://t.me/share/url?url=${u}&text=${tx}`,
  };
}

// Shared addresses are canonical PATHS: no locale prefix and no query (filters,
// utm), so the recipient opens them in their own language. The origin is not a
// build-time constant; it is added at share time from `window.location.origin`,
// so staging and preview links show the right host (see `resolveShareUrl`).

/** A listing's canonical path, `/listings/<slug>-<uuid>` (ADR 0017). */
export function listingSharePath(listing: ListingUrlSource): string {
  return listingPath(listing);
}

export function collectionSharePath(idOrSlug: string): string {
  return `/collections/${idOrSlug}`;
}

/** Salt okunur paylaşım görünümüne giden ürün sayısı sınırı (URL uzunluğu + N istek). */
export const MAX_SHARED_FAVORITES = 50;

/** Favoriler listesi: herkese açık `/favorites?ids=` görünümü (ilk 50 ürün). */
export function favoritesSharePath(productIds: readonly string[]): string {
  const ids = productIds.slice(0, MAX_SHARED_FAVORITES);
  return `/favorites?ids=${ids.map(encodeURIComponent).join(",")}`;
}

/** Yalnız istemcide, olay anında çağrılır (SSR'da gerekmez). */
export function resolveShareUrl(path: string): string {
  return `${window.location.origin}${path}`;
}

/**
 * Dokunmatik cihaz + Web Share API: sistem paylaşım sayfası kullanılır.
 * Masaüstü tarayıcılar `navigator.share` sunsa da (Safari/Edge) menü gösterilir.
 */
export function canShareNatively(): boolean {
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    return false;
  }
  return (
    typeof navigator.share === "function" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(pointer: coarse)").matches
  );
}

/**
 * `navigator.share` hatasında menüye düşülür mü? Yalnız izin/geçersiz veri
 * hatalarında (NotAllowedError, TypeError). İptal (AbortError) ve zaten açık
 * paylaşım (InvalidStateError) sessizce yok sayılır.
 */
export function shouldFallbackToMenu(error: unknown): boolean {
  const name = (error as { name?: string } | null)?.name;
  return name === "NotAllowedError" || name === "TypeError";
}

/** Sosyal ağ penceresi: opener/referrer sızdırmadan yeni sekme. */
export function openShareWindow(href: string): void {
  window.open(href, "_blank", "noopener,noreferrer");
}

function legacyCopy(text: string): boolean {
  const el = document.createElement("textarea");
  el.value = text;
  el.setAttribute("readonly", "");
  el.style.position = "fixed";
  el.style.opacity = "0";
  document.body.appendChild(el);
  el.select();
  el.setSelectionRange(0, text.length);
  try {
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    el.remove();
  }
}

/** Panoya yazar; Clipboard API yoksa/reddedilirse `execCommand` yedeği. */
export async function copyText(text: string): Promise<boolean> {
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // izin yok / güvensiz bağlam → eski yönteme düş
    }
  }
  return legacyCopy(text);
}
