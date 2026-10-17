/** @format */

/**
 * Afiş bağlantı güvenliği — tek kaynak.
 *
 * Bağlantıyı admin yazar; `javascript:`, `data:` gibi şemalar ya da `//evil`
 * (protokol-göreli, başka siteye gider) tıklamada çalışmasın. Yalnız `http(s)://`
 * ve site-içi `/…` yolu geçer; diğerleri `null` döner ve bağlantı HİÇ çizilmez.
 */
export function safeAdHref(url: string | null | undefined): string | null {
  const value = url?.trim();
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) return value;
  if (value.startsWith("/") && !value.startsWith("//")) {
    // Ters bölü bazı tarayıcılarda `/` sayılır: `/\evil.com` → `//evil.com`.
    return value.startsWith("/\\") ? null : value;
  }
  return null;
}

/** Site-içi mi (Next Link ile gezilir), dış mı (yeni sekme). */
export function isExternalAdHref(href: string): boolean {
  return !href.startsWith("/");
}
