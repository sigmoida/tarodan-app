/**
 * Faz 0 — public `products/` altına yanlış düşmüş içeriklerin yeni köklerine
 * taşınması için SAF eşleme yardımcıları. `scripts/migrate-media-folders.ts`
 * bunları kullanır; başka hiçbir key'e dokunulmaz (gerçek ürün görselleri,
 * avatarlar, seed-assets null döner).
 */

const LEGACY_MAPPINGS: Array<{ from: RegExp; to: string }> = [
  // Mesaj ekleri → PRIVATE messages kökü.
  { from: /^([a-z0-9_-]+)\/products\/messages\//, to: "$1/messages/" },
  // Review/kanıt görselleri → public reviews kökü.
  { from: /^([a-z0-9_-]+)\/products\/reviews\//, to: "$1/reviews/" },
  // Web koleksiyon yüklemeleri → collections çatısı altında ayrı klasör.
  {
    from: /^([a-z0-9_-]+)\/products\/collections\//,
    to: "$1/collections/user-uploads/",
  },
];

/** Eski (yanlış çatıdaki) key'i yeni köküne eşler; eşleşmeyen key'e null. */
export function legacyKeyToNewKey(key: string): string | null {
  for (const { from, to } of LEGACY_MAPPINGS) {
    if (from.test(key)) return key.replace(from, to);
  }
  return null;
}

/**
 * Metin içine gömülü (Message.content) eski public URL'leri yeniden yazar.
 * `mapper(key)` yeni TAM URL döner (mesajlar için yetkili servis ucu),
 * null dönerse URL olduğu gibi bırakılır.
 */
export function rewriteLegacyUrlsInText(
  text: string,
  publicBaseUrl: string,
  mapper: (key: string) => string | null,
): string {
  const base = publicBaseUrl.replace(/\/$/, "");
  const escaped = base.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // URL, boşluk/tırnak/parantez sınırına kadar okunur.
  const pattern = new RegExp(`${escaped}/([^\\s"'<>)]+)`, "g");
  return text.replace(pattern, (full, key: string) => mapper(key) ?? full);
}
