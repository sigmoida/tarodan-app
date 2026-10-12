/** @format */

/**
 * `next.config.js` → `images.remotePatterns` ile AYNI sunucu adları. Listede
 * olmayan bir adres `next/image` optimizasyonundan geçirilirse 400 döner; o
 * yüzden yalnız bu adresler optimize edilir, gerisi `unoptimized` gider.
 * `next.config.js`i değiştirirsen burayı da güncelle.
 */
const OPTIMIZED_IMAGE_HOSTS = new Set([
  "localhost",
  "127.0.0.1",
  "amzn-tarodan.s3.eu-west-1.amazonaws.com",
  "s3.eu-west-1.amazonaws.com",
]);

/** Göreli (site-içi) ya da izinli sunucudan gelen görsel optimize edilebilir. */
export function isOptimizableImage(src: string): boolean {
  if (!/^https?:\/\//i.test(src)) return true;
  try {
    return OPTIMIZED_IMAGE_HOSTS.has(new URL(src).hostname);
  } catch {
    return false;
  }
}
