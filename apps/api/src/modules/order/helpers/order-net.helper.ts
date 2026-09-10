/**
 * Satıcı net hak edişinin TEK formülü.
 *
 *   net = ürün bedeli
 *       + ürün KDV'si            (alıcıdan tahsil edilip satıcıya AKTARILIR)
 *       − satıcı ücretleri       (komisyon + platform hizmet bedeli)
 *       − satıcı hizmet KDV'si   (satıcıya verilen hizmetlerin KDV'si)
 *       − stopaj                 (GVK 94/19)
 *       − satıcı kargo payı      (satıcının üstlendiği gerçek maliyet)
 *       + platform-fonlu kupon   (indirimi platform üstlendiyse satıcıya GERİ eklenir)
 *
 * Eskiden sipariş yanıtı ile admin/ilan önizlemesi bu hesabı ayrı ayrı yazıyordu;
 * ikisi de buraya delege eder ki önizleme ile gerçek payout ayrışmasın.
 *
 * Escrow (`escrow-hold.service.ts`) aynı parayı alıcı toplamından geriye doğru
 * ayrıştırır; iki hesap terim terim aynı sonucu verir. Platform-fonlu kupon payı
 * yalnız escrow'da geri ekleniyordu, dolayısıyla böyle bir kampanyada ekranlar
 * satıcıya ödenenden DÜŞÜK bir net gösteriyordu.
 */

export interface SellerNetInput {
  /** KDV hariç ürün bedeli (indirim sonrası). */
  subtotal: number;
  /** Ürün KDV'si — sistemde ürün KDV'si yok, her zaman 0. */
  productTaxAmount: number;
  /** Satıcı komisyonu + platform hizmet bedeli. */
  sellerFeeAmount: number;
  /** Stopaj. */
  withholdingTaxAmount: number;
  /** Satıcının üstlendiği kargo payı. */
  sellerShippingAmount: number;
  /** Satıcıya verilen hizmetlerin KDV'si. */
  sellerServiceTaxAmount: number;
  /**
   * Kupon indiriminin PLATFORM tarafından finanse edilen kısmı
   * (`Order.platformFundedDiscount`). Satıcı indirim ÖNCESİ tutar üzerinden
   * ödenir, farkı platform üstlenir — bu yüzden nete GERİ eklenir. Satıcı-fonlu
   * (varsayılan) kuponda 0'dır.
   */
  platformFundedDiscount: number;
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
    num(input.sellerServiceTaxAmount) +
    num(input.platformFundedDiscount);

  // Kesintiler bedeli aşarsa payout 0'dır — negatif hak ediş yazılmaz.
  return Math.max(0, Math.round((net + Number.EPSILON) * 100) / 100);
}
