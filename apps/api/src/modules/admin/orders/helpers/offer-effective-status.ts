import { OfferStatus } from "@prisma/client";

/**
 * Görünen teklif durumu: süresi geçmiş `pending` teklif cron çalışana kadar
 * DB'de pending kalır; kullanıcı ekranları gibi admin de onu `expired` gösterir.
 *
 * İstisna: cron'un extend_once ile uzatacağı teklif (`extensionPending`,
 * `OfferExtensionPolicy.willExtend` — cron ve kullanıcı ekranlarıyla aynı kural)
 * `pending` kalır; "expired" görünüp yeniden açılmaz.
 */
export function offerEffectiveStatus(
  row: { status: OfferStatus; expiresAt: Date },
  now = new Date(),
  extensionPending = false,
): OfferStatus {
  return row.status === OfferStatus.pending &&
    row.expiresAt < now &&
    !extensionPending
    ? OfferStatus.expired
    : row.status;
}
