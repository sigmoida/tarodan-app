import { sellerNetAmountOf } from "./order-net.helper";

/**
 * Satıcı net hak edişinin TEK formülü. Eskiden sipariş yanıtı ve admin/ilan
 * önizlemesi bu hesabı ayrı ayrı yazıyordu; ikisi de artık buraya delege eder,
 * böylece önizleme ile gerçek payout sessizce ayrışamaz.
 */
describe("sellerNetAmountOf", () => {
  const input = (
    over: Partial<Parameters<typeof sellerNetAmountOf>[0]> = {},
  ) => ({
    subtotal: 500,
    productTaxAmount: 0,
    sellerFeeAmount: 55,
    withholdingTaxAmount: 5,
    sellerShippingAmount: 50,
    sellerServiceTaxAmount: 21,
    platformFundedDiscount: 0,
    ...over,
  });

  it("referans tablo (500 TL): 500 − 55 − 5 − 50 − 21 = 369", () => {
    expect(sellerNetAmountOf(input())).toBe(369);
  });

  it("satıcı hizmet KDV'si nettten DÜŞÜLÜR", () => {
    const withVat = sellerNetAmountOf(input());
    const withoutVat = sellerNetAmountOf(input({ sellerServiceTaxAmount: 0 }));

    expect(withoutVat - withVat).toBe(21);
  });

  it("ürün KDV'si satıcıya AKTARILIR (nete eklenir) — açıldığında geri gelir", () => {
    expect(sellerNetAmountOf(input({ productTaxAmount: 100 }))).toBe(469);
  });

  it("kargo payı satıcıdaysa maliyettir, düşülür", () => {
    expect(sellerNetAmountOf(input({ sellerShippingAmount: 0 }))).toBe(419);
  });

  it("net asla eksiye düşmez", () => {
    expect(
      sellerNetAmountOf(input({ subtotal: 10, sellerFeeAmount: 500 })),
    ).toBe(0);
  });

  it("platform-fonlu kupon payı nete GERİ eklenir", () => {
    // Kupon indirimini platform üstlendiyse satıcı indirim ÖNCESİ tutar
    // üzerinden ödenir; escrow da payout'a bunu ekler. Terim eksikken ekranlar
    // satıcıya ödenenden düşük bir net gösteriyordu.
    const funded = sellerNetAmountOf(input({ platformFundedDiscount: 100 }));

    expect(funded - sellerNetAmountOf(input())).toBe(100);
  });

  it("satıcı-fonlu kuponda net değişmez", () => {
    expect(sellerNetAmountOf(input({ platformFundedDiscount: 0 }))).toBe(369);
  });

  it("kuruş hassasiyetini korur", () => {
    expect(
      sellerNetAmountOf({
        subtotal: 999,
        productTaxAmount: 0,
        sellerFeeAmount: 109.89,
        withholdingTaxAmount: 9.99,
        platformFundedDiscount: 0,
        sellerShippingAmount: 50,
        sellerServiceTaxAmount: 31.98,
      }),
    ).toBe(797.14);
  });
});
