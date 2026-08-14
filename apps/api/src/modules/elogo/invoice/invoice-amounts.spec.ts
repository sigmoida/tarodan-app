import { AMOUNT_BASIS_BY_TYPE, invoiceAmountsFor } from "./invoice-amounts";

/**
 * Faturada KDV'nin yönü, faturanın TÜRÜNE bağlıdır — ortama değil.
 *
 * Komisyon ve hizmet bedeli faturaları `order.sellerFeeAmount` /
 * `order.buyerFeeAmount` üzerinden kesilir; bunlar KDV HARİÇ matrahtır (KDV artık
 * `buyer_service_tax_amount` / `seller_service_tax_amount` kolonlarında ayrı
 * durur). Platform satışı, üyelik ve öne çıkarma ise tüketici fiyatı üzerinden
 * kesilir; o fiyat KDV DAHİLDİR.
 *
 * Bu ayrım eskiden tek bir `ELOGO_AMOUNTS_INCLUDE_VAT` env bayrağıydı: her iki
 * aileye aynı davranışı uyguladığı için komisyon faturalarında KDV tutardan
 * ayrıştırılıyor, oysa gerçekte satıcıdan üstüne eklenerek tahsil ediliyordu.
 */
describe("invoiceAmountsFor", () => {
  it("komisyon: matrah üstüne KDV EKLENİR (55 → 55 + 11 = 66)", () => {
    expect(invoiceAmountsFor("commission", 55, 20)).toEqual({
      net: 55,
      tax: 11,
      total: 66,
    });
  });

  it("hizmet bedeli: matrah üstüne KDV EKLENİR (45 → 45 + 9 = 54)", () => {
    expect(invoiceAmountsFor("service_fee", 45, 20)).toEqual({
      net: 45,
      tax: 9,
      total: 54,
    });
  });

  it("platform satışı: tüketici fiyatından KDV AYRIŞTIRILIR (600 → 500 + 100)", () => {
    expect(invoiceAmountsFor("platform_sale", 600, 20)).toEqual({
      net: 500,
      tax: 100,
      total: 600,
    });
  });

  it("üyelik ve öne çıkarma da brüt fiyattan ayrıştırır", () => {
    expect(invoiceAmountsFor("membership", 120, 20).net).toBe(100);
    expect(invoiceAmountsFor("boost", 240, 20).net).toBe(200);
  });

  it("takas komisyonu da matrah bazlıdır (250 → 250 + 50 = 300)", () => {
    expect(AMOUNT_BASIS_BY_TYPE.trade_commission).toBe("net");
    expect(invoiceAmountsFor("trade_commission", 250, 20)).toEqual({
      net: 250,
      tax: 50,
      total: 300,
    });
  });

  it("KDV oranı 0 ise iki ailede de vergi doğmaz", () => {
    expect(invoiceAmountsFor("commission", 55, 0)).toEqual({
      net: 55,
      tax: 0,
      total: 55,
    });
    expect(invoiceAmountsFor("platform_sale", 600, 0)).toEqual({
      net: 600,
      tax: 0,
      total: 600,
    });
  });

  it("kuruşa yuvarlar ve net + tax = total korunur", () => {
    const net = invoiceAmountsFor("commission", 33.33, 20);
    expect(net).toEqual({ net: 33.33, tax: 6.67, total: 40 });

    const gross = invoiceAmountsFor("platform_sale", 99.99, 20);
    expect(Math.round((gross.net + gross.tax) * 100) / 100).toBe(gross.total);
  });

  it("her fatura türünün bir matrah tanımı vardır — yeni tür sessizce düşemez", () => {
    for (const [type, basis] of Object.entries(AMOUNT_BASIS_BY_TYPE)) {
      expect(["net", "gross"]).toContain(basis);
      expect(type.length).toBeGreaterThan(0);
    }
  });
});
