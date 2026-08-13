/** @format */

import { ShippingPackageTierCode } from "@prisma/client";
import { resolvePackageShippingDecision } from "./shipping-tariff.helper";

/**
 * Ücretsiz kargo eşiği KUPON ÖNCESİ tutardan denetlenir (indirim-müşteri §4,
 * senaryo İ14): alıcının kuponu, kazanılmış ücretsiz kargoyu geri alamaz.
 */
describe("free-shipping threshold basis", () => {
  const tariff = {
    freeShippingEnabled: true,
    freeShippingThreshold: 500,
    packageTiers: [
      {
        code: ShippingPackageTierCode.small,
        minDesi: 0,
        maxDesi: null,
        amount: 80,
      },
    ],
  };

  it("kupon tutarı eşiğin altına düşürse bile kupon öncesi tutar eşiği geçiyorsa kargo ücretsizdir", () => {
    // 600 TL sepet, 200 TL kupon → tahsil edilen taban 400 TL. Eşik 500 TL.
    const decision = resolvePackageShippingDecision({
      tariff,
      subtotal: 400,
      billableDesi: 1,
      lineShares: [],
      thresholdSubtotal: 600,
    });
    expect(decision.fullShipping).toBe(0);
    expect(decision.buyer).toBe(0);
  });

  it("kupon öncesi tutar da eşiğin altındaysa kargo ücretlidir", () => {
    const decision = resolvePackageShippingDecision({
      tariff,
      subtotal: 300,
      billableDesi: 1,
      lineShares: [],
      thresholdSubtotal: 450,
    });
    expect(decision.fullShipping).toBe(80);
  });

  it("thresholdSubtotal verilmezse subtotal kullanılır (kuponsuz yollar)", () => {
    expect(
      resolvePackageShippingDecision({
        tariff,
        subtotal: 500,
        billableDesi: 1,
        lineShares: [],
      }).fullShipping,
    ).toBe(0);
    expect(
      resolvePackageShippingDecision({
        tariff,
        subtotal: 499.99,
        billableDesi: 1,
        lineShares: [],
      }).fullShipping,
    ).toBe(80);
  });
});
