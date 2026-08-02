/**
 * Faz 1 — Brand.logo değerini istemci URL'sine çözer (TEK kaynak).
 *
 * Sözleşme: logo bir S3 KEY'idir ({env}/brands/{slug}.webp) ve URL
 * getPublicAssetUrl ile kurulur — DB'ye asla tam URL yazılmaz (CDN geçişi
 * tek env değişikliğiyle olsun). İki tolerans:
 *  - mutlak http(s) URL olduğu gibi döner (admin'in girdiği harici logo),
 *  - eski repo yolları ("/photos/logolar/…") null'a düşer: statik dosyalar
 *    kaldırıldı, önyüz logo yoksa baş-harf placeholder gösterir.
 */
export function resolveBrandLogoUrl(
  logo: string | null | undefined,
  toPublicUrl: (key: string) => string,
): string | null {
  if (!logo) return null;
  if (/^https?:\/\//i.test(logo)) return logo;
  if (logo.startsWith("/")) return null;
  return toPublicUrl(logo) || null;
}
