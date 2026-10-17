import type { OrderReservationState } from "@tarodan/types";

/**
 * Ödenmemiş bir sipariş ürün rezervasyonu TUTUYOR mu — tek kural:
 * - doğrudan satış (`offerId` yok): rezerv sipariş oluşurken alınır;
 * - teklif siparişi: rezerv İLK ödeme başlatmada, Payment satırıyla AYNI
 *   işlemde alınır (payment-initiation) → Payment satırı yoksa rezerv yoktur;
 * - `reservationReleasedAt` doluysa süpürme rezervi zaten bırakmıştır.
 *
 * Rezerv sayacı mutabakatı (reservation-reconciliation, "Bulgu D") aynı
 * kuralı Prisma `where` olarak uygular; ikisi ayrışırsa iptal başkasının
 * canlı rezervini düşürür (oversell) ya da sayaç şişer.
 */
export function orderReservationState(order: {
  reservationReleasedAt: Date | null;
  offerId: string | null;
  hasPayment: boolean;
}): OrderReservationState {
  if (order.reservationReleasedAt) return "already_released";
  if (order.offerId && !order.hasPayment) return "not_reserved";
  return "held";
}
