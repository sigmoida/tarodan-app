/**
 * TAKAS İADE POLİTİKASI (v2) — TEK kaynak.
 *
 * v2'de ödemenin içinde KARGO da vardır. Ürün kargoya verildikten sonra iptal
 * olduğunda platform iki bacağın maliyetini gerçekten ödemiştir: o tutar iade
 * EDİLMEZ. Henüz hiçbir ürün kargoya verilmemişken iptal olursa hizmet hiç
 * alınmamıştır → TAM iade (kullanılmamış hizmetin bedeli tutulmaz).
 *
 * Hizmet bedeli ve nakit fark her iki durumda da iade edilir.
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
}

/**
 * Bu ödeme satırından iade edilecek tutar.
 *
 * v1 satırlarında `shippingAmount` 0 olduğu için sonuç her zaman tam iadedir —
 * eski davranış korunur.
 */
export function refundableAmountFor(
  payment: RefundablePayment,
  ctx: TradeRefundContext,
): number {
  const total = Number(payment.totalAmount) || 0;
  if (!tradeRefundExcludesShipping(ctx)) return round2(total);
  const shipping = Number(payment.shippingAmount) || 0;
  return round2(Math.max(0, total - shipping));
}
