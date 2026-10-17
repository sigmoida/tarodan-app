import { PaymentStatus, type Prisma } from "@prisma/client";
import { resolveTimingValue } from "../../../common/timing-rules";
import { asPaymentMetadata } from "./payment-metadata.types";

/**
 * CANLI ÇEKİM — ödenmemiş siparişi kapatan yolların ortak sorusu.
 *
 * Direct-form claim'i ödeme satırına `lastChargeStartedAt` damgasını basar;
 * kullanıcı 3DS ekranındayken PayTR çekimi sürer ve sonuç callback'le gelir.
 * Bu pencerede siparişi kapatmak (alıcı / yönetici iptali, 24s süpürmesi)
 * parası çekilmiş iptal sipariş demektir: callback otomatik iade eder, ama
 * arada bırakılan stok başka birine satılabilir. Pencere Süreler ve Kurallar
 * → `paymentFailTimeoutMinutes`.
 */

/**
 * Siparişin henüz sonuçlanmamış ödeme satırı — siparişin kendi ödemesi ya da
 * (sepette) grubunun ödemesi.
 */
export function liveOrderPaymentWhere(
  orderId: string,
): Prisma.PaymentWhereInput {
  return {
    OR: [{ orderId }, { checkoutGroup: { orders: { some: { id: orderId } } } }],
    status: { in: [PaymentStatus.pending, PaymentStatus.processing] },
  };
}

/** Ödemenin son 3DS çekimi pencere içinde mi başladı (saf). */
export function chargeLikelyLive(
  metadata: unknown,
  windowMinutes: number,
): boolean {
  const raw = asPaymentMetadata(metadata).lastChargeStartedAt;
  if (typeof raw !== "string") return false;
  const startedAt = new Date(raw).getTime();
  if (Number.isNaN(startedAt)) return false;
  return Date.now() - startedAt < windowMinutes * 60 * 1000;
}

/**
 * Siparişin (ya da sepetinin) canlı bir çekimi var mı? Çağıran sipariş
 * satırını KİLİTLEMİŞ olmalıdır: claim de aynı satırı kilitleyerek yazdığı
 * için ya claim önce commit etmiştir (damga görünür) ya da claim bu işlemi
 * bekler ve kilit altında iptali görüp reddeder (bkz. payment-order-lock).
 * Süre de verilen istemciden okunur: işlem bir bağlantı tutarken ikinci bir
 * bağlantı beklenmez.
 */
export async function orderHasLiveCharge(
  db: Prisma.TransactionClient,
  orderId: string,
): Promise<boolean> {
  const windowMinutes = await resolveTimingValue(
    db,
    "paymentFailTimeoutMinutes",
  );
  const live = await db.payment.findFirst({
    where: liveOrderPaymentWhere(orderId),
    select: { metadata: true },
  });
  return !!live && chargeLikelyLive(live.metadata, windowMinutes);
}
