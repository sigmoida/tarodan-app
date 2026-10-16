/** @format */

import { SITE_URL } from "@/lib/seo";

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

// Paylaşılan URL'ler kanonik olur: site origin'i + yol; locale öneki ve query
// (filtre, utm, vb.) taşınmaz — alıcı kendi diliyle açılır.

export function listingShareUrl(id: string): string {
  return `${SITE_URL}/listings/${id}`;
}

export function collectionShareUrl(idOrSlug: string): string {
  return `${SITE_URL}/collections/${idOrSlug}`;
}

/** Favoriler listesi: ürün kimlikleri `?ids=` ile (salt okunur paylaşım görünümü). */
export function favoritesShareUrl(productIds: readonly string[]): string {
  return `${SITE_URL}/profile/favorites?ids=${productIds
    .map(encodeURIComponent)
    .join(",")}`;
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

/** Kullanıcının iptali (paylaşım sayfasını kapatma) hata sayılmaz. */
export function isShareAbort(error: unknown): boolean {
  return (error as { name?: string } | null)?.name === "AbortError";
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
