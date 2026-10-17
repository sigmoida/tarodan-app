import { CancellationActor, TradeStatus } from "@prisma/client";
import { isTradeExpiryCancelReason } from "./trade-cancel-reasons";

/**
 * "Bir takası iptal etmek" ne demek — TEK tanım (`orderCancelledData`'nın
 * takas karşılığı; ret için `tradeRejectedData`).
 *
 * İptal yolları (kullanıcı iptali, süre dolumu, stok kaskadı, kayıp koli, ban,
 * üyelik düşüşü, yönetici zorla iptali, iade bacaklarının kapanışı) statüyü ve
 * damgayı ayrı ayrı yazıyordu; iptali KİMİN yaptığı hiç yazılmıyordu. Admin
 * "İptal & İade" ekranı iptalleri aktöre göre ayırdığı için aktör ZORUNLU
 * parametredir — yeni bir yol onu unutamaz. Gerekçe (`cancelReason`) çağıranın
 * işidir: iade kapanışı yöneticinin önceden yazdığı gerekçeyi korumalıdır.
 *
 * @param by İptali yapan taraf (initiator = buyer, receiver = seller).
 * @param at İptal anı (aynı transaction içinde tek `now` paylaşmak için).
 */
export function tradeCancelledData(
  by: CancellationActor,
  at: Date = new Date(),
): {
  status: typeof TradeStatus.cancelled;
  cancelledAt: Date;
  cancelledBy: CancellationActor;
} {
  return { status: TradeStatus.cancelled, cancelledAt: at, cancelledBy: by };
}

/**
 * Takas, ÖDEME süresi dolduğu için süre dolumu taramasınca mı iptal edildi?
 *
 * Satır aşamayı ayrıca kaydetmez; karar en dar sinyallerin birleşimidir:
 * aktör `system` (yalnız cron yolları; taraf iptali buyer/seller, admin
 * platform yazar), gerekçe süre dolumu sabiti (yalnız tarama yazar — taraf
 * serbest metinle aynı cümleyi yazsa bile aktörü onu dışarıda tutar), ödeme
 * son tarihi kurulmuş ve kargolama son tarihi kurulmamış (iptal anında takas
 * `awaiting_payment`taydı; kargolama süresi aşımı bu kümeye girmez).
 */
export function isPaymentExpiryCancellation(trade: {
  status: TradeStatus;
  cancelledBy: CancellationActor | null;
  cancelReason: string | null;
  paymentDeadline: Date | null;
  shippingDeadline: Date | null;
}): boolean {
  return (
    trade.status === TradeStatus.cancelled &&
    trade.cancelledBy === CancellationActor.system &&
    isTradeExpiryCancelReason(trade.cancelReason) &&
    trade.paymentDeadline !== null &&
    trade.shippingDeadline === null
  );
}

/**
 * Kullanıcının kendi eylemiyle iptal ettiği takasta aktör: teklifi açan taraf
 * (initiator) `buyer`, ilan sahibi (receiver) `seller`. Taraf olmayan bir
 * kullanıcı buraya ulaşmamalı (yetki kapısı önce çalışır) — ulaşırsa sessizce
 * yanlış taraf yazmak yerine hata verir.
 */
export function tradePartyActor(
  trade: { initiatorId: string; receiverId: string },
  userId: string,
): CancellationActor {
  if (trade.initiatorId === userId) return CancellationActor.buyer;
  if (trade.receiverId === userId) return CancellationActor.seller;
  throw new Error(`tradePartyActor: ${userId} is not a party of the trade`);
}
