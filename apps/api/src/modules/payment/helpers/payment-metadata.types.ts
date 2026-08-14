/**
 * Faz 9.1: Payment.metadata (Prisma Json) için tek merkezi tip. Kod tabanında bu alan
 * onlarca yerde `(payment.metadata as any)` / `as Record<string, any>` ile okunuyordu;
 * alan adları/şekilleri sessizce sürüklenebiliyordu. Bu interface bilinen alanları
 * belgeler ve tipler; index signature ile ileride eklenen alanlara da izin verir
 * (permissive superset — mevcut okuma yerlerine düşük riskle uygulanabilir).
 */
export interface PaymentMetadata {
  /** Re-init'te rotate edilen eski merchant_oid'ler (callback/reconcile taraması). */
  merchantOidHistory?: string[];
  /** MONEY-M4: order-yolu iade-in-progress marker'ı; yeni format {amount,at}, eski string. */
  refundInProgressOrders?: Record<
    string,
    { amount: number; at: string } | string
  >;
  /** MONEY-H1: trade-cash yolu iade-in-progress marker'ı (scalar ISO). */
  refundInProgressAt?: string;
  /** Sipariş başına kümülatif iade edilen tutar (grup + tekil). */
  refundedOrders?: Record<string, number>;
  /** Kümülatif iade tutarı. */
  refundAmount?: number;
  /** Son iade zamanı (ISO). */
  refundedAt?: string;
  /** Son sağlayıcı iade sonucu (ham). */
  refundResult?: unknown;
  /** FLOW-H2: son 3DS charge-claim zamanı (ISO) — canlı-3DS penceresi hesabı. */
  lastChargeStartedAt?: string;
  /** Ödeme aksiyon denetim izi. */
  auditHistory?: Array<Record<string, unknown>>;
  /** Takas-nakit iadesi işareti. */
  tradeCashRefund?: boolean;
  /** retryPayment/initiation izleri. */
  retriedFrom?: string;
  retriedAt?: string;
  /** İleride eklenen alanlar (permissive). */
  [key: string]: unknown;
}

/** metadata'yı güvenle PaymentMetadata olarak okur (null/undefined → boş nesne). */
export function asPaymentMetadata(metadata: unknown): PaymentMetadata {
  return (metadata as PaymentMetadata) || {};
}
