import { CancellationActor, TradeStatus } from "@prisma/client";

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
