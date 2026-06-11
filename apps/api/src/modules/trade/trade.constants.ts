import { TradeStatus } from '@prisma/client';

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
