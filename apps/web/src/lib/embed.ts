/**
 * "Uygulama modu" (embed) sayfaları: mobil uygulamanın WebView'de açtığı, site
 * kromu (başlık, alt bilgi, çerez bandı, reklam) olmayan yasal metinler.
 *
 * Yol sözleşmesi (mobil ajanla sabit): Türkçe `/app/<doc>`, İngilizce
 * `/en/app/<doc>`. Bu dosya o sözleşmenin TEK kaynağıdır — middleware (locale
 * tespiti), rota (generateStaticParams), muafiyet kuralları ve çerez bandı
 * gizleme hep buradan okur. Saf ve edge-uyumludur (middleware de import eder).
 */

/** Embed yollarının ortak öneki (locale öneki ÇIKARILMIŞ yolda). */
export const EMBED_PREFIX = "/app";

/** Uygulamada gömülen belgeler; değer hem alt yol hem normal sitedeki yoldur. */
export const EMBED_DOCS = [
  "terms",
  "privacy",
  "distance-sales",
  "cookies",
  "seller-agreement",
  "refund-policy",
] as const;
export type EmbedDoc = (typeof EMBED_DOCS)[number];

export function isEmbedDoc(value: string): value is EmbedDoc {
  return (EMBED_DOCS as readonly string[]).includes(value);
}

/** Locale'siz yol embed alanında mı (`/app` ya da `/app/...`). */
export function isEmbedPath(pathname: string): boolean {
  return pathname === EMBED_PREFIX || pathname.startsWith(`${EMBED_PREFIX}/`);
}
