import { OfferStatus } from "@prisma/client";

/**
 * Görünen teklif durumu: süresi geçmiş `pending` teklif cron çalışana kadar
 * DB'de pending kalır; kullanıcı ekranları gibi admin de onu `expired` gösterir.
 */
export function offerEffectiveStatus(
  row: { status: OfferStatus; expiresAt: Date },
  now = new Date(),
): OfferStatus {
  return row.status === OfferStatus.pending && row.expiresAt < now
    ? OfferStatus.expired
    : row.status;
}
