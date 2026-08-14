import {
  calculateServiceTax,
  type ServiceTaxBreakdown,
} from "./order-service-tax.helper";

/**
 * Hizmet bedeli KDV'si: "alıcıya verdiğimiz her hizmet için alıcıdan, satıcıya
 * verdiğimiz her hizmet için satıcıdan %20 KDV" kuralının TEK kaynağı.
 *
 * Matrahlar sipariş satırında zaten duruyor (komisyon, hizmet bedeli, kargo payı);
 * bu yardımcı yalnız iki toplamı üretir — biri alıcının ödediğine EKLENİR, diğeri
 * satıcının payout'undan KESİLİR. Ürün bedeli matraha GİRMEZ.
 */
describe("calculateServiceTax", () => {
  const breakdown = (over: Partial<ServiceTaxBreakdown> = {}) => ({
    buyerCommissionAmount: 0,
    buyerServiceFeeAmount: 0,
    buyerShippingAmount: 0,
    sellerCommissionAmount: 0,
    sellerPlatformFeeAmount: 0,
    sellerShippingAmount: 0,
    ...over,
  });

  it("500 TL / 250-999 kademesi: alıcı 19, satıcı 21 (referans tablo)", () => {
    // Alıcı: komisyon %4 = 20, koruma %5 = 25, kargo payı 50 → matrah 95
    // Satıcı: komisyon %6 = 30, platform %5 = 25, kargo payı 50 → matrah 105
    const result = calculateServiceTax(
      breakdown({
        buyerCommissionAmount: 20,
        buyerServiceFeeAmount: 25,
        buyerShippingAmount: 50,
        sellerCommissionAmount: 30,
        sellerPlatformFeeAmount: 25,
        sellerShippingAmount: 50,
      }),
      20,
    );

    expect(result.buyerServiceTaxAmount).toBe(19);
    expect(result.sellerServiceTaxAmount).toBe(21);
  });

  it("999 TL: kuruşlu matrahlarda kalem bazında yuvarlar", () => {
    // Alıcı: 39.96 + 49.95 + 50 → KDV 7.99 + 9.99 + 10 = 27.98
    // Satıcı: 59.94 + 49.95 + 50 → KDV 11.99 + 9.99 + 10 = 31.98
    const result = calculateServiceTax(
      breakdown({
        buyerCommissionAmount: 39.96,
        buyerServiceFeeAmount: 49.95,
        buyerShippingAmount: 50,
        sellerCommissionAmount: 59.94,
        sellerPlatformFeeAmount: 49.95,
        sellerShippingAmount: 50,
      }),
      20,
    );

    expect(result.buyerServiceTaxAmount).toBe(27.98);
    expect(result.sellerServiceTaxAmount).toBe(31.98);
  });

  it("ÜRÜN bedeli matraha girmez — yalnız hizmet kalemleri vergilenir", () => {
    // Ürün 10.000 TL olsa bile hiçbir hizmet bedeli yoksa KDV sıfırdır.
    const result = calculateServiceTax(breakdown(), 20);

    expect(result.buyerServiceTaxAmount).toBe(0);
    expect(result.sellerServiceTaxAmount).toBe(0);
  });

  it("kargo tek tarafa yüklendiğinde KDV de tek tarafta doğar", () => {
    // shippingBuyerShare = 100 → satıcı kargo payı 0.
    const result = calculateServiceTax(
      breakdown({
        buyerCommissionAmount: 20,
        buyerShippingAmount: 100,
        sellerCommissionAmount: 30,
        sellerShippingAmount: 0,
      }),
      20,
    );

    expect(result.buyerServiceTaxAmount).toBe(24);
    expect(result.sellerServiceTaxAmount).toBe(6);
  });

  it("oran 0 ise (KDV kapalı) iki taraf da sıfırdır", () => {
    const result = calculateServiceTax(
      breakdown({
        buyerCommissionAmount: 20,
        buyerShippingAmount: 50,
        sellerCommissionAmount: 30,
        sellerShippingAmount: 50,
      }),
      0,
    );

    expect(result.buyerServiceTaxAmount).toBe(0);
    expect(result.sellerServiceTaxAmount).toBe(0);
  });

  it("geçersiz oran (negatif / NaN) sıfır sayılır — fail-safe", () => {
    const fees = breakdown({
      buyerCommissionAmount: 20,
      sellerCommissionAmount: 30,
    });

    expect(calculateServiceTax(fees, -5).buyerServiceTaxAmount).toBe(0);
    expect(calculateServiceTax(fees, Number.NaN).sellerServiceTaxAmount).toBe(
      0,
    );
  });

  it("kalem bazında yuvarlar: toplam, fatura satırlarının toplamına EŞİT olur", () => {
    // 0.125 → 0.13 ve 0.125 → 0.13 (kalem bazında) = 0.26.
    // Önce toplayıp yuvarlasaydık 0.25 çıkardı ve fatura satırları tutmazdı.
    const result = calculateServiceTax(
      breakdown({ buyerCommissionAmount: 0.625, buyerServiceFeeAmount: 0.625 }),
      20,
    );

    expect(result.buyerServiceTaxAmount).toBe(0.26);
  });

  it("negatif matrah gelmez — kesinti tutarları asla eksi olamaz", () => {
    const result = calculateServiceTax(
      breakdown({ buyerCommissionAmount: -20, sellerCommissionAmount: -30 }),
      20,
    );

    expect(result.buyerServiceTaxAmount).toBe(0);
    expect(result.sellerServiceTaxAmount).toBe(0);
  });

  it("eksik/undefined alanlar 0 sayılır (kısmi kırılım güvenli)", () => {
    const result = calculateServiceTax(
      { buyerCommissionAmount: 20, sellerCommissionAmount: 30 } as any,
      20,
    );

    expect(result.buyerServiceTaxAmount).toBe(4);
    expect(result.sellerServiceTaxAmount).toBe(6);
  });
});
