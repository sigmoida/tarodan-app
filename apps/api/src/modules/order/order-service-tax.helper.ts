/**
 * Hizmet bedeli KDV'si — platformun verdiği hizmetlerin vergisi.
 *
 * Kural tek cümledir: **hizmeti kim aldıysa KDV'sini o öder.** Alıcıya verilen
 * hizmetlerin (alıcı komisyonu, koruma hizmeti, alıcı kargo payı) KDV'si alıcının
 * ödediğine EKLENİR; satıcıya verilen hizmetlerin (satıcı komisyonu, platform
 * hizmet bedeli, satıcı kargo payı) KDV'si satıcının payout'undan KESİLİR.
 *
 * ÜRÜN BEDELİ MATRAHA GİRMEZ. Ürün KDV'si ayrı bir kavramdır (`Order.taxAmount`),
 * `product_vat_enabled` ayarıyla yönetilir ve bu hesabın dışındadır.
 *
 * Matrahların hepsi sipariş satırında zaten kolon olarak duruyor; bu yüzden kalem
 * bazında KDV saklanmaz, yalnız iki taraf toplamı persist edilir.
 */

export interface ServiceTaxBreakdown {
  /** Alıcı tarafı — alıcının ödediğine eklenecek KDV'nin matrahları. */
  buyerCommissionAmount: number;
  buyerServiceFeeAmount: number;
  buyerShippingAmount: number;
  /** Satıcı tarafı — satıcı payout'undan kesilecek KDV'nin matrahları. */
  sellerCommissionAmount: number;
  sellerPlatformFeeAmount: number;
  sellerShippingAmount: number;
}

export interface ServiceTaxResult {
  /** Alıcı toplamına EKLENİR. */
  buyerServiceTaxAmount: number;
  /** Satıcı payout'undan KESİLİR. */
  sellerServiceTaxAmount: number;
}

const round2 = (value: number): number =>
  Math.round((value + Number.EPSILON) * 100) / 100;

/** Negatif/NaN matrah kesinti üretemez — 0'a düşer. */
const base = (value: number | null | undefined): number =>
  Number.isFinite(value) && (value as number) > 0 ? (value as number) : 0;

/**
 * Tek kalemin KDV'si, KURUŞA yuvarlanmış olarak.
 *
 * Yuvarlama kalem bazındadır (önce toplayıp sonra değil): her hizmet kalemi kendi
 * e-faturasında ayrı satır olarak görünüyor, dolayısıyla saklanan toplam fatura
 * satırlarının toplamına birebir eşit olmak zorunda. Önce toplayıp yuvarlamak
 * kuruşluk sapmalar bırakır ve mutabakat tutmaz.
 */
const lineTax = (amount: number | null | undefined, rate: number): number =>
  round2(base(amount) * (rate / 100));

/**
 * @param breakdown Sipariş satırının hizmet bedeli kırılımı.
 * @param vatRate   KDV oranı (%), ör. 20. Geçersiz/negatif ise KDV hesaplanmaz.
 */
export function calculateServiceTax(
  breakdown: ServiceTaxBreakdown,
  vatRate: number,
): ServiceTaxResult {
  const rate = Number.isFinite(vatRate) && vatRate > 0 ? vatRate : 0;
  if (rate === 0) {
    return { buyerServiceTaxAmount: 0, sellerServiceTaxAmount: 0 };
  }

  const buyerServiceTaxAmount = round2(
    lineTax(breakdown?.buyerCommissionAmount, rate) +
      lineTax(breakdown?.buyerServiceFeeAmount, rate) +
      lineTax(breakdown?.buyerShippingAmount, rate),
  );
  const sellerServiceTaxAmount = round2(
    lineTax(breakdown?.sellerCommissionAmount, rate) +
      lineTax(breakdown?.sellerPlatformFeeAmount, rate) +
      lineTax(breakdown?.sellerShippingAmount, rate),
  );

  return { buyerServiceTaxAmount, sellerServiceTaxAmount };
}
