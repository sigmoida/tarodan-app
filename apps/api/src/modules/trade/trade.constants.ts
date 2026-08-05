import { TradeStatus } from "@prisma/client";

// Ürünü "aktif takasta" sayan statüler — hem teklif oluşturma validasyonu
// (trade.service.createTrade) hem de /products/my?tradeEligible=true filtresi
// (product.service.findSellerProducts) tek kaynaktan bunu kullanır.
export const ACTIVE_TRADE_STATUSES: TradeStatus[] = [
  TradeStatus.pending,
  TradeStatus.accepted,
  TradeStatus.initiator_shipped,
  TradeStatus.receiver_shipped,
  TradeStatus.both_shipped,
  TradeStatus.initiator_received,
  TradeStatus.receiver_received,
];

/**
 * Takas fiyatlama sürümleri (`Trade.pricingVersion`).
 *
 * `v1`: tek taraflı, nakit farkının yüzdesi olarak alınan aracılık komisyonu.
 * `v2`: iki taraf da öder — sabit takas hizmet bedeli + 2× kargo + (varsa fark).
 *
 * Devam eden takaslar KABUL EDİLDİKLERİ sürümle biter; ayrım tek yerde, bu
 * alanda yapılır (ekranlar, ödeme ve iade yolları buna bakar).
 */
export const TRADE_PRICING_V1 = "v1";
export const TRADE_PRICING_V2 = "v2";

/**
 * Takasın "birincil" ödeme satırı — nakit farkını taşıyan satır, yoksa ilki.
 *
 * v1'de takas başına tek satır vardı ve tüm ekranlar/servisler `trade.cashPayment`
 * okuyordu. v2'de taraf başına satır var; tek satır bekleyen ESKİ yollar (v1
 * takaslar, legacy DTO alanı, GraphQL tipi) bu yardımcıdan geçer. Yeni yollar
 * satırların TAMAMINI okur — "iki ödeme de tamam mı" sorusu ancak öyle sorulabilir.
 */
export function primaryCashPayment<T>(
  payments: T[] | null | undefined,
): T | null {
  if (!payments || payments.length === 0) return null;
  // Fark taşıyan satır "birincil"dir; hiçbiri fark taşımıyorsa (v2 kafa kafaya
  // takas) ilk satır döner.
  return (
    payments.find((p) => Number((p as { amount?: unknown }).amount) > 0) ??
    payments[0]
  );
}
