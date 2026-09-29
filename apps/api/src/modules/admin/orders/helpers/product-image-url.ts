/**
 * Admin listelerinin ürün görseli: S3 anahtarı ya da (eski kayıtta) tam URL →
 * gösterilebilir URL. Siparişler ve İptaller listesi aynı çözümü kullanır.
 *
 * @param publicAssetUrl Depolama servisinin anahtar → genel URL çözücüsü
 *   (servis yoksa — dar birim testleri — anahtar çözülemez, null döner).
 */
export function resolveProductImageUrl(
  imageKeyOrUrl: string | null | undefined,
  publicAssetUrl?: (key: string) => string | null | undefined,
): string | null {
  if (!imageKeyOrUrl) return null;
  const isUrl =
    imageKeyOrUrl.startsWith("http://") || imageKeyOrUrl.startsWith("https://");
  // Süresi dolmuş presigned S3 parametrelerini at → kalıcı genel URL.
  if (isUrl && imageKeyOrUrl.includes("X-Amz-Signature")) {
    try {
      const parsed = new URL(imageKeyOrUrl);
      parsed.search = "";
      return parsed.toString();
    } catch {
      // fall through
    }
  }
  if (isUrl || imageKeyOrUrl.startsWith("/")) return imageKeyOrUrl;
  return publicAssetUrl?.(imageKeyOrUrl) ?? null;
}
