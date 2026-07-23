/**
 * Outbox olay tipleri (dispatch anahtarları) — magic string yerine tek kaynak.
 * Her tip için idempotent bir handler kayıtlıdır (OutboxHandlerRegistry).
 */

/** Sürat kargo gönderisini iptal et (iade sonrası). Handler idempotent no-op'tur. */
export const OUTBOX_SHIPMENT_CANCEL = "shipment.cancel";

export interface ShipmentCancelPayload {
  orderId: string;
  orderNumber: string;
}
