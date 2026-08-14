import { ElogoInvoiceType } from "@prisma/client";

/**
 * Bir faturada KDV'nin yönü, faturanın TÜRÜNE bağlıdır — ortama değil.
 *
 * Eskiden bu karar tek bir `ELOGO_AMOUNTS_INCLUDE_VAT` env bayrağıydı ve tüm
 * türlere aynı davranışı uyguluyordu. Hizmet bedeli KDV'si ayrı kolonlara
 * (`buyer_service_tax_amount` / `seller_service_tax_amount`) taşındıktan sonra bu
 * yanlış hale geldi: komisyon faturası, satıcıdan ÜSTÜNE eklenerek tahsil edilmiş
 * KDV'yi tutarın İÇİNDEN ayrıştırıyor ve her faturada beyan açığı bırakıyordu.
 *
 * Artık kural türün kendisinde ve ortamdan bağımsız:
 *
 *   net   → saklanan tutar KDV HARİÇ matrahtır, KDV üstüne EKLENİR.
 *           Komisyon ve hizmet bedeli `order.sellerFeeAmount` /
 *           `order.buyerFeeAmount` üzerinden kesilir; bunlar matrahtır.
 *
 *   gross → saklanan tutar tüketici fiyatıdır (KDV DAHİL), KDV AYRIŞTIRILIR.
 *           Platform satışı, üyelik ve öne çıkarma böyle çalışır.
 */
export type InvoiceAmountBasis = "net" | "gross";

export const AMOUNT_BASIS_BY_TYPE: Record<
  ElogoInvoiceType,
  InvoiceAmountBasis
> = {
  // Platformun kestiği hizmet faturaları — matrah saklanır, KDV ayrı kolonda.
  commission: "net",
  service_fee: "net",
  // Tüketici fiyatı üzerinden kesilenler — fiyat KDV dahildir.
  platform_sale: "gross",
  membership: "gross",
  boost: "gross",
  // Takas nakit komisyonu (v1 — LEGACY) matrah saklar: KDV'si `commission_tax_amount`
  // kolonunda ayrı durur ve ödeyenin toplamına eklenir.
  trade_commission: "net",
  // Takas hizmet bedeli (v2): admin kurala KDV DAHİL tutarı girer ve taraftan bu
  // tutar tahsil edilir — üstüne KDV EKLENMEZ, içinden ayrıştırılır.
  trade_service_fee: "gross",
  // İade faturası kaynak faturanın tutarını terslediği için onun matrahını izler;
  // pratikte `repriceUnsentInvoice`/refund yolu kendi kaynağından hesaplar.
  return_invoice: "gross",
};

const round2 = (value: number): number =>
  Math.round((value + Number.EPSILON) * 100) / 100;

export interface InvoiceAmounts {
  /** KDV matrahı. */
  net: number;
  /** KDV tutarı. */
  tax: number;
  /** net + tax. */
  total: number;
}

/**
 * @param type   Fatura türü — KDV'nin yönünü bu belirler.
 * @param amount Saklanan tutar (türe göre matrah ya da brüt).
 * @param vatRate KDV oranı (%).
 */
export function invoiceAmountsFor(
  type: ElogoInvoiceType,
  amount: number,
  vatRate: number,
): InvoiceAmounts {
  const rate = Number.isFinite(vatRate) && vatRate > 0 ? vatRate : 0;
  if (rate === 0) {
    const flat = round2(amount);
    return { net: flat, tax: 0, total: flat };
  }

  const net =
    AMOUNT_BASIS_BY_TYPE[type] === "gross"
      ? round2(amount / (1 + rate / 100))
      : round2(amount);
  const tax = round2(net * (rate / 100));
  return { net, tax, total: round2(net + tax) };
}
