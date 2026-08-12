/**
 * TAKAS İADE POLİTİKASI (v2) — TEK kaynak.
 *
 * HİZMET BEDELİ HİÇBİR İPTALDE İADE EDİLMEZ: bedel, güvenli takas hizmetinin
 * karşılığıdır (eşleştirme, escrow, depo kontrol operasyonu) ve iptal edilen
 * takasta da bu hizmet süreci işletilir. v1 satırlarında aynı rolü nakit-fark
 * komisyonu (+KDV'si) oynar; o da iade edilmez.
 *
 * KARGO bedeli yalnız fiilen kullanıldıysa iade dışıdır: ürün kargoya
 * verildikten sonra iptal olduğunda platform bacakların maliyetini gerçekten
 * ödemiştir. Henüz hiçbir ürün kargoya verilmemişken iptalde kargo hizmeti hiç
 * doğmadığı için kargo bedeli iade edilir.
 *
 * NAKİT FARK her durumda iade edilir (takas gerçekleşmedi; fark alıcısına
 * gidecek para payerına döner).
 *
 * NOT: takas TAMAMLANDIKTAN sonra iade süreci yoktur (`completed` terminal;
 * itiraz yolu yalnız dispute). Bu politika iptal / red / depoya-kabul-etmeme
 * yollarında geçerlidir.
 */

const round2 = (value: number): number =>
  Math.round((value + Number.EPSILON) * 100) / 100;

export interface TradeRefundContext {
  /**
   * Takasın herhangi bir bacağı kargoya verildi mi. `Trade.cancelLockedAt` /
   * `firstWarehouseArrivalAt` ya da gönderilerin `shippedAt`'i ile belirlenir —
   * kullanıcı iptal kilidiyle AYNI eşik (bkz. `computeTradeCanCancel`).
   */
  handedToCargo: boolean;
}

/** Kargo bedeli iade dışı mı? (yalnız kargoya verildikten sonra) */
export function tradeRefundExcludesShipping(ctx: TradeRefundContext): boolean {
  return ctx.handedToCargo;
}

export interface RefundablePayment {
  /** Tahsil edilen toplam. */
  totalAmount: number | string | { toString(): string };
  /** Bu satırdaki kargo bedeli (v1 satırlarında 0). */
  shippingAmount: number | string | { toString(): string };
  /** v2 sabit hizmet bedeli (KDV dahil; v1 satırlarında 0). */
  tradeFeeAmount?: number | string | { toString(): string } | null;
  /** v1 nakit-fark komisyonu ve KDV'si (v2 satırlarında 0). */
  commissionAmount?: number | string | { toString(): string } | null;
  commissionTaxAmount?: number | string | { toString(): string } | null;
}

export interface TradeRefundCandidate extends RefundablePayment {
  /** İadeyi yapacak gerçek Payment satırının durumu ve sağlayıcısı. */
  paymentStatus: string;
  provider: string;
  /** Escrow bırakıldıysa veya daha önce iade edildiyse tekrar iade edilemez. */
  releasedAt?: Date | string | null;
  refundedAt?: Date | string | null;
}

/** Satırın iade edilmeyen hizmet bedeli bileşeni (v2 sabit ücret ∪ v1 komisyon+KDV). */
export function tradeServiceFeeOf(payment: RefundablePayment): number {
  return round2(
    Math.max(0, Number(payment.tradeFeeAmount ?? 0) || 0) +
      Math.max(0, Number(payment.commissionAmount ?? 0) || 0) +
      Math.max(0, Number(payment.commissionTaxAmount ?? 0) || 0),
  );
}

/**
 * Bu ödeme satırından iade edilecek tutar:
 * `total − hizmetBedeli − (kargoya verildiyse kargo)` — asla negatif olmaz.
 */
export function refundableAmountFor(
  payment: RefundablePayment,
  ctx: TradeRefundContext,
): number {
  const total = Number(payment.totalAmount) || 0;
  const serviceFee = tradeServiceFeeOf(payment);
  const shipping = tradeRefundExcludesShipping(ctx)
    ? Number(payment.shippingAmount) || 0
    : 0;
  return round2(Math.max(0, total - serviceFee - shipping));
}

/**
 * Sağlayıcı iade yolunun hem uygunluk hem tutar politikası. Admin önizlemesi de
 * bunu kullanır; böylece operatöre gösterilen etki PayTR yolundan sapmaz.
 */
export function tradePaymentRefundableAmountFor(
  payment: TradeRefundCandidate,
  ctx: TradeRefundContext,
): number {
  if (
    payment.paymentStatus !== "completed" ||
    payment.provider !== "paytr" ||
    payment.releasedAt != null ||
    payment.refundedAt != null
  ) {
    return 0;
  }
  return refundableAmountFor(payment, ctx);
}
