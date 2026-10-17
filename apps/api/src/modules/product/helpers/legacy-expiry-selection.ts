/**
 * Bu özellikten ÖNCE süresi dolup pasife alınmış ilanların (işaretsiz — nedeni
 * kayıtlı değil) tek seçim kuralı. Amaç muhafazakârlık: yanlış ilanı "süresi
 * doldu" saymaktansa gerçek bir kaçağı atlamak daha ucuzdur (admin işlemi bir
 * kez daha çalıştırılabilir; yanlış reaktivasyon geri alınamaz).
 *
 * Gerçek zaman damgası kanıtı yoktur: eski gece işi yalnız `status = inactive`
 * yazıyordu. Kural, işin kendi iz bıraktığı tek şeye dayanır — `updatedAt`.
 * Gece işi ilanı `yayın anı + ömür` dolduğu ilk koşuda pasife alır; o yazım
 * `updatedAt`'i işin çalıştığı ana çeker. Dolayısıyla süre-dolumu ile pasife
 * alınmış ilan için
 *
 *     ömür  ≤  (updatedAt − yayın anı)  ≤  ömür + tolerans
 *
 * Bunu sağlayan ilan "ömür dolunca pasife alınmış" sayılır. Elle pasife alma
 * (ömür dolmadan yapılır; yoksa gece işi zaten kapatırdı) alt sınırda, pasife
 * alındıktan SONRA yazılmış (updatedAt ilerlemiş) ilanlar üst sınırda elenir.
 *
 * Belirsiz kalanlar (bkz. docs/TIMING_RULES.md):
 *  - Ömür sonradan KISALTILDIYSA: eski ömürle yapılmış, ama yeni ömre göre
 *    alt sınırın üstünde kalan bir elle pasife alma yanlış eşleşebilir.
 *    (Ömür UZATILDIYSA eski bir süre-dolumu alt sınırın altında kalır: kaçar.)
 *  - Pasife alındıktan sonra herhangi bir yazım (admin düzenlemesi vb.)
 *    `updatedAt`'i kaydırır: ilan üst sınırı aşar ve kaçar.
 *  - Gece işi tolerans günlerinden uzun durduysa gecikmiş dolumlar kaçar.
 */
export type LegacyExpiryVerdict =
  | "match"
  /** Pasife alındığında ömrü henüz dolmamıştı: elle pasife alma / başka neden. */
  | "not_at_lifetime"
  /** Pasife alındıktan çok sonra yazılmış: dolum anı kanıtlanamıyor. */
  | "touched_after_expiry"
  /** Stok 0: stok bitişiyle pasife alınmış olabilir. */
  | "out_of_stock"
  /** Satıcı banlı ya da silinmiş: yenilenemez, dokunulmaz. */
  | "seller_unavailable";

export interface LegacyExpiryCandidate {
  publishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  quantity: number | null;
  seller: { isBanned: boolean; deletedAt: Date | null };
}

const DAY_MS = 24 * 60 * 60 * 1000;
/** Gece işi `setDate` (takvim günü) kullanır; yaz/kış saati farkı için 1 saat pay. */
const CLOCK_SKEW_MS = 60 * 60 * 1000;

export function classifyLegacyExpiry(
  listing: LegacyExpiryCandidate,
  rule: { ttlDays: number; graceDays: number },
): LegacyExpiryVerdict {
  if (listing.seller.isBanned || listing.seller.deletedAt !== null) {
    return "seller_unavailable";
  }
  // Stok 0 ya da negatif: stok bitişi (getProductStatusFromQuantity) de ilanı
  // inactive yapar ve işaret bırakmaz — süre-dolumundan ayırt edilemez.
  if (listing.quantity !== null && listing.quantity <= 0) {
    return "out_of_stock";
  }
  const anchor = listing.publishedAt ?? listing.createdAt;
  const lifetimeAtLastWrite = listing.updatedAt.getTime() - anchor.getTime();
  if (lifetimeAtLastWrite < rule.ttlDays * DAY_MS - CLOCK_SKEW_MS) {
    return "not_at_lifetime";
  }
  if (lifetimeAtLastWrite > (rule.ttlDays + rule.graceDays) * DAY_MS) {
    return "touched_after_expiry";
  }
  return "match";
}
