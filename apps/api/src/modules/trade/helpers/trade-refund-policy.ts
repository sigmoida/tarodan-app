/**
 * TAKAS İADE POLİTİKASI (v2) — TEK kaynak.
 *
 * İki soru sorulur, sırayla:
 *
 * 1) BU TARAF KUSURSUZ MU? Takas, bu tarafın hiçbir kusuru olmadan bozulduysa
 *    (karşı taraf ödemedi, karşı taraf kargolamadı, karşı taraf vazgeçti,
 *    karşı tarafın ürünü depo kontrolünden geçmedi, koli kargoda kayboldu)
 *    iade TAM tutar üzerinden yapılır: hizmet bedeli ve kargo dahil. Kusursuz
 *    tarafın cebinden hiçbir şey çıkmaz; doğan maliyeti platform üstlenir.
 *    Karar iptali yazan yolda verilir ve ödeme satırına
 *    `fullRefundEntitled` olarak KAYDEDİLİR — iade sağlayıcıda patlayıp retry
 *    cron'una düşse bile aynı tutar yeniden hesaplansın diye.
 *
 * 2) DEĞİLSE, kalem kalem düşülür:
 *    - HİZMET BEDELİ iade edilmez: bedel, güvenli takas hizmetinin (eşleştirme,
 *      escrow, depo kontrol operasyonu) karşılığıdır ve iptal edilen takasta da
 *      bu süreç işletilmiştir. v1 satırlarında aynı rolü nakit-fark komisyonu
 *      (+KDV'si) oynar.
 *    - KARGO yalnız fiilen kullanıldıysa iade dışıdır: ürün kargoya verildikten
 *      sonraki iptalde platform bacakların maliyetini gerçekten ödemiştir. Hiç
 *      kargolanmadan iptalde kargo hizmeti hiç doğmadığı için iade edilir.
 *    - NAKİT FARK her durumda iade edilir (takas gerçekleşmedi).
 *
 * Kusur atfının yapıldığı yerler:
 *   · ödeme süresi aşımı        → ödeyen taraf kusursuz
 *   · kullanıcı iptali          → KARŞI taraf kusursuz (vazgeçen değil)
 *   · takılı takas çözümü       → kolisini kargoya vermiş taraf kusursuz
 *   · kayıp koli                → iki taraf da kusursuz (taşıyıcı kaynaklı)
 *   · depo reddi                → `faultySide` dışındaki taraf kusursuz
 *   · kargolama süresi aşımı, hiçbir koli verilmedi → iki taraf da kusurlu
 *
 * NOT: takas TAMAMLANDIKTAN sonra iade süreci yoktur (`completed` terminal;
 * itiraz yolu ayrıdır ve ürünleri geri toplamaz — orada mağduriyet tazminatla
 * kapatılır, bu matrisle değil).
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
  /**
   * Bu tarafın kusuru olmadan bozulan takas → tam iade. İptali yazan yol
   * karar verir ve satıra kaydeder (`TradeCashPayment.fullRefundEntitled`).
   */
  fullRefundEntitled?: boolean | null;
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

/** Kargo bedeli iade dışı mı? (yalnız kargoya verildikten sonra, kusurlu tarafta) */
export function tradeRefundExcludesShipping(
  payment: RefundablePayment,
  ctx: TradeRefundContext,
): boolean {
  if (payment.fullRefundEntitled) return false;
  return ctx.handedToCargo;
}

/**
 * Bu ödeme satırından iade edilecek tutar. Kusursuz tarafta tahsil edilenin
 * TAMAMI; aksi halde `total − hizmetBedeli − (kargoya verildiyse kargo)`.
 * Asla negatif olmaz.
 */
export function refundableAmountFor(
  payment: RefundablePayment,
  ctx: TradeRefundContext,
): number {
  const total = Number(payment.totalAmount) || 0;
  if (payment.fullRefundEntitled) return round2(Math.max(0, total));
  const serviceFee = tradeServiceFeeOf(payment);
  const shipping = tradeRefundExcludesShipping(payment, ctx)
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
