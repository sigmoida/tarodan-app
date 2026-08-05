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

/** Başarılı iade sonrası eLogo e-belge düzeltmesi. Refund-attempt bazında idempotent. */
export const OUTBOX_INVOICE_REFUND_REVERSE = "invoice.refund_reverse";

export interface InvoiceRefundReversePayload {
  orderId: string;
  refundAttemptId: string;
  /** Bu denemenin sipariş toplamına oranı, [0,1]. */
  refundRatio: number;
  /** Bu denemeyle siparişin kümülatif iadesi tamamlandı mı? */
  fullyRefunded: boolean;
  /** Politika tablosundan gelen kesin kesinti ters kayıtları. */
  sellerFeeRefundAmount?: number;
  buyerFeeRefundAmount?: number;
}

/** Ödenmiş sanal hizmetin gelir faturasını oluştur/gönder. */
export const OUTBOX_REVENUE_INVOICE_ISSUE = "invoice.revenue_issue";

export interface RevenueInvoiceIssuePayload {
  orderId?: string;
  membershipPaymentId?: string;
  kind: "membership" | "boost";
}

/**
 * Teslim edilen fiziksel siparişin gelir faturaları (komisyon / hizmet bedeli /
 * platform satışı). Teslim tx'iyle ATOMİK yazılır: kargo poll'u teslimatı
 * işaretlediği anda fatura görevi de kalıcı olur. Eskiden faturalama YALNIZ
 * 2 dakikalık backfill cron'una bağlıydı; cron'un aday penceresi doyduğunda veya
 * cron gecikince e-Arşiv'in 7 günlük süresi kaçırılabiliyordu. İdempotent
 * (issue* çağrıları `(type, sourceId)` unique'i üzerinden no-op olur).
 */
export const OUTBOX_ORDER_REVENUE_INVOICE = "invoice.order_revenue";

export interface OrderRevenueInvoicePayload {
  orderId: string;
}

/** Takas nakit iadesi sonrası eLogo komisyon e-Arşiv ters kaydı. İdempotent. */
export const OUTBOX_INVOICE_TRADE_CASH_REFUND_REVERSE =
  "invoice.trade_cash_refund_reverse";

export interface InvoiceTradeCashRefundReversePayload {
  tradeCashPaymentId: string;
}

/**
 * Ödenmiş fiziksel siparişin POST-COMMIT sonlandırması (ledger capture + order.paid
 * + Sürat gönderi) için DAYANIKLI backstop (#8). Ödeme tx'iyle ATOMİK yazılır; anlık
 * event yolu çökme penceresinde kaybolursa drainer bu satırdan sonlandırmayı tamamlar.
 * Anlık yol BAŞARIRSA satır `completed` işaretlenir → backstop çalışmaz (çift yan-etki yok).
 * Handler idempotenttir: ledger existence-guard'lı, kargo mevcut-kontrollü.
 */
export const OUTBOX_ORDER_FULFILLMENT = "order.fulfillment_requested";

export interface OrderFulfillmentOutboxPayload {
  orderId: string;
  /** Sepet (grup) siparişi: alıcı onayı grup başına tek gönderilir → order başına atla. */
  skipBuyer?: boolean;
  transactionId?: string;
}

/**
 * Kullanıcının yerelde revoke ettiği kayıtlı kartı ödeme sağlayıcısından temizle.
 * Payload yalnız yerel kayıt kimliğini taşır; sağlayıcı token'ları handler içinde
 * taze yüklenir ve outbox tablosuna yazılmaz.
 */
export const OUTBOX_SAVED_CARD_PROVIDER_DELETE = "saved_card.provider_delete";

export interface SavedCardProviderDeletePayload {
  savedCardId: string;
}
