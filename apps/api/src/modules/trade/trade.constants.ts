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
