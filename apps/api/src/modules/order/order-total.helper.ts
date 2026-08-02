/**
 * Alıcının ödediği toplamın TEK formülü.
 *
 *   toplam = ürün bedeli (indirim sonrası)
 *          + alıcı kargo payı
 *          + alıcı ücretleri      (alıcı komisyonu + koruma/hizmet bedeli)
 *          + alıcı hizmet KDV'si  (yukarıdaki üç kalemin KDV'si)
 *
 * Ürün bedeline KDV EKLENMEZ: vitrin fiyatı KDV dahil kabul edilir. KDV yalnız
 * platformun verdiği hizmetlerin (komisyon, kargo payı, hizmet bedeli) üzerinden
 * doğar; stopaj ise satıcı payout'undan kesilir ve alıcı toplamını etkilemez.
 *
 * Bu dosya, formülün beş ayrı yerde (direkt alım, sepet, misafir, teklif ve
 * checkout quote'u) elle yazılmış olmasının sonucudur: dördü aynıydı, beşincisi
 * — kullanıcının checkout ekranında gördüğü tutarı üreten quote — hizmet
 * KDV'sini hiç eklemiyordu. Gösterilen tutar tahsil edilenden düşüktü. Yeni bir
 * kalem eklenecekse SADECE burası değişir.
 *
 * Satıcı tarafının karşılığı `order-net.helper.ts` (sellerNetAmountOf).
 */

export interface BuyerTotalInput {
  /** İndirim/kupon sonrası ürün bedeli. */
  subtotal: number;
  /** Alıcının üstlendiği kargo payı. */
  buyerShippingAmount: number;
  /** Alıcı komisyonu + alıcı hizmet bedeli. */
  buyerFeeAmount: number;
  /** Alıcıya verilen hizmetlerin KDV'si. */
  buyerServiceTaxAmount: number;
}

const num = (value: number | null | undefined): number =>
  Number.isFinite(value) ? (value as number) : 0;

export function buyerTotalOf(input: BuyerTotalInput): number {
  const total =
    num(input.subtotal) +
    num(input.buyerShippingAmount) +
    num(input.buyerFeeAmount) +
    num(input.buyerServiceTaxAmount);

  return Math.max(0, Math.round((total + Number.EPSILON) * 100) / 100);
}
