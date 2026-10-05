/**
 * Outbox olay tipleri (dispatch anahtarları) — magic string yerine tek kaynak.
 * Her tip için idempotent bir handler kayıtlıdır (OutboxHandlerRegistry).
 */

/** Kargo gönderisini yerelde iptal et (iade sonrası); uzak Sürat çağrısı yapmaz. */
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

/**
 * Platform (admin) takas iptalinin taraf duyurusu. İptal ve zorunlu denetim
 * kaydıyla AYNI tx'te yazılır: iptal commit olduysa duyuru kesin gider.
 *
 * Satır = TEK alıcı × TEK kanal (in-app ya da e-posta), `dedupeKey` de öyle:
 * handler tek bir gönderim yapar, hata fırlatırsa outbox yalnız O gönderimi
 * yeniden dener — kısmi başarıdan sonra başka bir alıcıya / kanala ikinci kez
 * gidilmez. Tutar iptal anında politikadan hesaplanıp burada sabitlenir
 * (iade yapıldıktan sonra satır "iade edilmiş" olur ve yeniden hesap 0 verir).
 * Adminin iç notu payload'a YAZILMAZ.
 */
export const OUTBOX_TRADE_PLATFORM_CANCEL_NOTICE =
  "trade.platform_cancel_notice";

export type TradePlatformCancelNoticeChannel = "in_app" | "email";

export interface TradePlatformCancelNoticePayload {
  tradeId: string;
  userId: string;
  refundAmount: number;
  channel: TradePlatformCancelNoticeChannel;
}

/**
 * Kargo öncesi iptalin commit SONRASI adımları (izlenen iade, ürün önbelleği,
 * taşıyıcıya geçmemiş etiketlerin iptali — `settlePreShipmentCancellation`).
 * İptal tx'iyle ATOMİK yazılır; anlık yol `OutboxService.runInline` ile satırın
 * sahibi olarak hemen çalıştırır. Süreç commit ile anlık yol arasında ölürse
 * satır pending kalır ve drainer işi tamamlar — iade hiçbir zaman "iptal
 * edildi ama hiç denenmedi" durumunda kalmaz. Adımların hepsi idempotenttir.
 */
export const OUTBOX_TRADE_CANCEL_SETTLE = "trade.cancel_settle";

export interface TradeCancelSettlePayload {
  tradeId: string;
}

export const tradeCancelSettleDedupeKey = (tradeId: string): string =>
  `${OUTBOX_TRADE_CANCEL_SETTLE}:${tradeId}`;

/**
 * İPTAL EDİLMİŞ takasa sonradan tamamlanan ödemenin iadesi. İptal yolları
 * iadeyi iptal anında tamamlanmış satırlara yapar; ödemesi o an yolda olan
 * tarafın (PayTR callback'i iptalden sonra gelir) parası aksi halde hiçbir
 * yoldan dönmez. Ödemeyi tamamlayan tx'le ATOMİK yazılır ve YALNIZ drainer
 * işler: iade PayTR callback'inin içinden (ödeme henüz "siteye bildirilmeden")
 * denenmez. Erken denemeyi PayTR reddederse handler satırı yeniden kuyruğa
 * alır; son denemede iş `refundFailureReason` + retry cron'una devredilir.
 * Tutar mevcut politikadan (`refundTradeCashTracked`, satırdaki
 * `fullRefundEntitled` kararıyla) gelir — yeni hesap yok. Ödeme satırı başına
 * tek satır.
 */
export const OUTBOX_TRADE_CANCELLED_PAYMENT_REFUND =
  "trade.cancelled_payment_refund";

export interface TradeCancelledPaymentRefundPayload {
  tradeId: string;
  /** İade yalnız bu tarafın satırını kapsar (`refundTradeCashTracked` kapsamı). */
  payerId: string;
  tradeCashPaymentId: string;
}

export const tradeCancelledPaymentRefundDedupeKey = (
  tradeCashPaymentId: string,
): string => `${OUTBOX_TRADE_CANCELLED_PAYMENT_REFUND}:${tradeCashPaymentId}`;
