import { calculateServiceTax } from "../order/order-service-tax.helper";
import { AMOUNT_BASIS_BY_TYPE } from "../elogo/invoice-amounts";

/**
 * Takas aracılık komisyonu da platformun verdiği bir HİZMETTİR — siparişteki
 * komisyonla aynı kural geçerli: KDV'si hizmeti alan taraftan (nakit ödeyen)
 * alınır ve onun ödediği toplama eklenir.
 *
 * Kapsam notu: Bu değişiklik yalnız KDV'yi bağlar. Takasın ekonomik modeli
 * (bugün yalnız nakit ödeyenden komisyon alınması) olduğu gibi bırakıldı;
 * iki taraftan da komisyon/platform bedeli almak ayrı bir karardır.
 */
describe("takas komisyonu KDV'si", () => {
  it("komisyon matrahının KDV'si ödeyene yüklenir (%20)", () => {
    // 5000 TL nakit farkı, %5 komisyon → 250 matrah, 50 KDV.
    const commission = 250;
    const { sellerServiceTaxAmount } = calculateServiceTax(
      {
        buyerCommissionAmount: 0,
        buyerServiceFeeAmount: 0,
        buyerShippingAmount: 0,
        sellerCommissionAmount: commission,
        sellerPlatformFeeAmount: 0,
        sellerShippingAmount: 0,
      },
      20,
    );

    expect(sellerServiceTaxAmount).toBe(50);
    // Ödeyenin toplamı: nakit farkı + komisyon + komisyon KDV'si
    expect(5000 + commission + sellerServiceTaxAmount).toBe(5300);
  });

  it("KDV kapatılırsa takas da KDV'siz kalır — tek politika", () => {
    const { sellerServiceTaxAmount } = calculateServiceTax(
      {
        buyerCommissionAmount: 0,
        buyerServiceFeeAmount: 0,
        buyerShippingAmount: 0,
        sellerCommissionAmount: 250,
        sellerPlatformFeeAmount: 0,
        sellerShippingAmount: 0,
      },
      0,
    );

    expect(sellerServiceTaxAmount).toBe(0);
  });

  it("takas komisyon faturası artık MATRAH bazlıdır (KDV üstüne eklenir)", () => {
    // `commission` KDV hariç saklandığına göre fatura da onu matrah saymalı;
    // aksi halde tahsil edilen KDV ile faturadaki KDV ayrışır.
    expect(AMOUNT_BASIS_BY_TYPE.trade_commission).toBe("net");
  });
});
