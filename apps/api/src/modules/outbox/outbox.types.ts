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

/** Tam iade sonrası eLogo e-Arşiv ters kaydı (iptal/iade faturası). İdempotent. */
export const OUTBOX_INVOICE_REFUND_REVERSE = "invoice.refund_reverse";

export interface InvoiceRefundReversePayload {
  orderId: string;
}

/** Takas nakit iadesi sonrası eLogo komisyon e-Arşiv ters kaydı. İdempotent. */
export const OUTBOX_INVOICE_TRADE_CASH_REFUND_REVERSE =
  "invoice.trade_cash_refund_reverse";

export interface InvoiceTradeCashRefundReversePayload {
  tradeCashPaymentId: string;
}
