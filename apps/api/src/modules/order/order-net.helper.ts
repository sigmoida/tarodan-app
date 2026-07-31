/**
 * Satıcı net hak edişinin TEK formülü.
 *
 *   net = ürün bedeli
 *       + ürün KDV'si            (alıcıdan tahsil edilip satıcıya AKTARILIR)
 *       − satıcı ücretleri       (komisyon + platform hizmet bedeli)
 *       − satıcı hizmet KDV'si   (satıcıya verilen hizmetlerin KDV'si)
 *       − stopaj                 (GVK 94/19)
 *       − satıcı kargo payı      (satıcının üstlendiği gerçek maliyet)
 *
 * Eskiden sipariş yanıtı ile admin/ilan önizlemesi bu hesabı ayrı ayrı yazıyordu;
 * ikisi de buraya delege eder ki önizleme ile gerçek payout ayrışmasın.
 */

export interface SellerNetInput {
  /** KDV hariç ürün bedeli (indirim sonrası). */
  subtotal: number;
  /** Ürün KDV'si — `product_vat_enabled` kapalıyken 0. */
  productTaxAmount: number;
  /** Satıcı komisyonu + platform hizmet bedeli. */
  sellerFeeAmount: number;
  /** Stopaj. */
  withholdingTaxAmount: number;
  /** Satıcının üstlendiği kargo payı. */
  sellerShippingAmount: number;
  /** Satıcıya verilen hizmetlerin KDV'si. */
  sellerServiceTaxAmount: number;
}

const num = (value: number | null | undefined): number =>
  Number.isFinite(value) ? (value as number) : 0;

export function sellerNetAmountOf(input: SellerNetInput): number {
  const net =
    num(input.subtotal) +
    num(input.productTaxAmount) -
    num(input.sellerFeeAmount) -
    num(input.withholdingTaxAmount) -
    num(input.sellerShippingAmount) -
    num(input.sellerServiceTaxAmount);

  // Kesintiler bedeli aşarsa payout 0'dır — negatif hak ediş yazılmaz.
  return Math.max(0, Math.round((net + Number.EPSILON) * 100) / 100);
}
