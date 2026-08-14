import { calculateRefundFinancialsV2 } from "./refund-financial-policy-v2";

describe("refund financial policy v2", () => {
  const base = {
    productGrossAmount: 1000,
    productTaxAmount: 100,
    buyerShippingAmount: 60,
    sellerShippingAmount: 40,
    outboundFullShippingAmount: 100,
    buyerCommissionAmount: 30,
    buyerPlatformFeeAmount: 50,
    sellerCommissionAmount: 40,
    sellerPlatformFeeAmount: 60,
    serviceVatRate: 20,
    returnShippingAmount: 100,
    orderQuantity: 1,
    refundQuantity: 1,
    hasShipped: true,
  } as const;

  it("seller fault refunds buyer commission and platform fee but retains seller platform fee", () => {
    const result = calculateRefundFinancialsV2({
      ...base,
      faultParty: "seller",
    });

    expect(result.components).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          componentCode: "buyer_commission",
          treatment: "buyer_refund",
          netAmount: 30,
          taxAmount: 6,
          grossAmount: 36,
        }),
        expect.objectContaining({
          componentCode: "buyer_platform_fee",
          treatment: "buyer_refund",
        }),
        expect.objectContaining({
          componentCode: "seller_platform_fee",
          treatment: "platform_retain",
        }),
      ]),
    );
  });

  it("buyer fault retains the buyer platform fee and refunds the seller platform fee", () => {
    const result = calculateRefundFinancialsV2({
      ...base,
      faultParty: "buyer",
    });

    expect(result.components).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          componentCode: "buyer_platform_fee",
          treatment: "platform_retain",
        }),
        expect.objectContaining({
          componentCode: "seller_platform_fee",
          treatment: "seller_refund",
        }),
      ]),
    );
  });

  it.each(["carrier", "platform"] as const)(
    "%s fault refunds both platform fees and leaves shipping with platform",
    (faultParty) => {
      const result = calculateRefundFinancialsV2({ ...base, faultParty });

      expect(result.components).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            componentCode: "buyer_platform_fee",
            treatment: "buyer_refund",
          }),
          expect.objectContaining({
            componentCode: "seller_platform_fee",
            treatment: "seller_refund",
          }),
          expect.objectContaining({
            componentCode: "outbound_shipping",
            treatment: "platform_absorb",
          }),
          expect.objectContaining({
            componentCode: "return_shipping",
            treatment: "platform_absorb",
          }),
        ]),
      );
      expect(result.carrierClaimRequired).toBe(faultParty === "carrier");
    },
  );

  it("defers outbound shipping to the line-completing refund and settles the package once", () => {
    // K7: kısmi iade gidiş kargosuna DOKUNMAZ — koli kalan teslim adetlere
    // hizmet etmiştir (v1'deki tazmin ilkesiyle aynı).
    const partial = calculateRefundFinancialsV2({
      ...base,
      faultParty: "seller",
      orderQuantity: 2,
      refundQuantity: 1,
    });
    expect(
      partial.components.some((c) => c.componentCode === "outbound_shipping"),
    ).toBe(false);
    expect(partial.outboundSettlementRequired).toBe(false);

    // Satırı (önceki iadelerle birlikte) TAMAMLAYAN talep, kargo bileşenlerini
    // tam koli üzerinden tek seferde üretir.
    const completing = calculateRefundFinancialsV2({
      ...base,
      faultParty: "seller",
      orderQuantity: 2,
      refundQuantity: 1,
      completesLine: true,
    });
    expect(completing.components).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          componentCode: "outbound_shipping",
          treatment: "buyer_refund",
          netAmount: 60,
          quantityPortion: 1,
        }),
        expect.objectContaining({
          componentCode: "outbound_shipping",
          treatment: "seller_charge",
          netAmount: 100,
          quantityPortion: 1,
        }),
      ]),
    );
    expect(completing.outboundSettlementRequired).toBe(true);

    // Koli mutabakatı tek seferliktir: mutabakat düştükten sonra tekrar üretilmez.
    const afterSettled = calculateRefundFinancialsV2({
      ...base,
      faultParty: "seller",
      orderQuantity: 2,
      refundQuantity: 1,
      completesLine: true,
      outboundAlreadySettled: true,
    });
    expect(
      afterSettled.components.some(
        (c) =>
          c.componentCode === "outbound_shipping" &&
          c.treatment === "seller_charge",
      ),
    ).toBe(false);
    expect(afterSettled.outboundSettlementRequired).toBe(false);
  });

  describe("paket kargosu PAKET başına bir kez iade edilir", () => {
    // Aynı satıcıdan iki satırlık sepet = TEK koli, TEK kargo bedeli. Satır
    // tamamlansa bile kardeş satır hâlâ gidiyorsa kargo iade edilmez; yoksa
    // her satır iptalinde aynı koli bedeli yeniden iade edilirdi.
    const outbound = (result: ReturnType<typeof calculateRefundFinancialsV2>) =>
      result.components.filter((c) => c.componentCode === "outbound_shipping");

    it("kardeş satır hâlâ gidiyorsa gidiş kargosu ÜRETİLMEZ (kargo öncesi iptal)", () => {
      const result = calculateRefundFinancialsV2({
        ...base,
        faultParty: "buyer",
        hasShipped: false,
        completesLine: true,
        closesPackageShipping: false,
      });

      expect(outbound(result)).toHaveLength(0);
      expect(result.outboundSettlementRequired).toBe(false);
    });

    it("paketi KAPATAN iptal kargoyu bir kez iade eder ve mutabakat ister", () => {
      const result = calculateRefundFinancialsV2({
        ...base,
        faultParty: "buyer",
        hasShipped: false,
        completesLine: true,
        closesPackageShipping: true,
      });

      expect(outbound(result)).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ treatment: "buyer_refund", netAmount: 60 }),
          expect.objectContaining({
            treatment: "seller_refund",
            netAmount: 40,
          }),
        ]),
      );
      // Kargo öncesi yolda da TEK SEFERLİK koli mutabakatı yazılır — eskiden
      // yazılmadığı için ikinci iptal kargoyu yeniden iade ettirebiliyordu.
      expect(result.outboundSettlementRequired).toBe(true);
    });

    it("mutabakat düşmüşse ikinci iptal kargoyu TEKRAR iade etmez", () => {
      const result = calculateRefundFinancialsV2({
        ...base,
        faultParty: "buyer",
        hasShipped: false,
        completesLine: true,
        closesPackageShipping: true,
        outboundAlreadySettled: true,
      });

      expect(outbound(result)).toHaveLength(0);
      expect(result.outboundSettlementRequired).toBe(false);
    });

    it("kargolanmış pakette de kardeş satır varsa gidiş kargosu üretilmez", () => {
      const result = calculateRefundFinancialsV2({
        ...base,
        faultParty: "seller",
        hasShipped: true,
        completesLine: true,
        closesPackageShipping: false,
      });

      expect(outbound(result)).toHaveLength(0);
      expect(result.outboundSettlementRequired).toBe(false);
    });

    it("paket alanı verilmezse davranış completesLine ile aynıdır (tek satırlık sipariş)", () => {
      const result = calculateRefundFinancialsV2({
        ...base,
        faultParty: "buyer",
        hasShipped: false,
        completesLine: true,
      });

      expect(outbound(result).length).toBeGreaterThan(0);
    });
  });

  it.each([0, 10, 20])(
    "keeps net + tax = gross at %s service VAT",
    (serviceVatRate) => {
      const result = calculateRefundFinancialsV2({
        ...base,
        faultParty: "seller",
        serviceVatRate,
      });
      for (const component of result.components) {
        expect(component.netAmount + component.taxAmount).toBeCloseTo(
          component.grossAmount,
          2,
        );
      }
    },
  );

  it("does not leak buyer service tax into the product amount", () => {
    const result = calculateRefundFinancialsV2({
      ...base,
      faultParty: "seller",
    });
    const product = result.components.find(
      (component) => component.componentCode === "product",
    );

    expect(product).toMatchObject({
      netAmount: 900,
      taxAmount: 100,
      grossAmount: 1000,
    });
  });

  it("caps buyer charges at refundable gross and preserves the amount invariant", () => {
    const result = calculateRefundFinancialsV2({
      ...base,
      productGrossAmount: 50,
      productTaxAmount: 0,
      buyerShippingAmount: 0,
      sellerShippingAmount: 0,
      outboundFullShippingAmount: 0,
      buyerCommissionAmount: 0,
      buyerPlatformFeeAmount: 0,
      sellerCommissionAmount: 0,
      sellerPlatformFeeAmount: 0,
      returnShippingAmount: 100,
      faultParty: "buyer",
    });
    const buyerImpact = result.components.reduce((sum, component) => {
      if (component.treatment === "buyer_refund") {
        return sum + component.grossAmount;
      }
      if (component.treatment === "buyer_charge") {
        return sum - component.grossAmount;
      }
      return sum;
    }, 0);

    expect(result.buyerRefundAmount).toBe(0);
    expect(buyerImpact).toBe(0);
  });
});
