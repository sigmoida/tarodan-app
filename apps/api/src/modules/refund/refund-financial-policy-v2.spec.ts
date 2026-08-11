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

  it("charges a seller-fault partial return the complete original package only once", () => {
    const first = calculateRefundFinancialsV2({
      ...base,
      faultParty: "seller",
      orderQuantity: 2,
      refundQuantity: 1,
    });
    const second = calculateRefundFinancialsV2({
      ...base,
      faultParty: "seller",
      orderQuantity: 2,
      refundQuantity: 1,
      outboundAlreadySettled: true,
    });

    expect(first.components).toEqual(
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
    expect(first.outboundSettlementRequired).toBe(true);
    expect(
      second.components.some(
        (c) =>
          c.componentCode === "outbound_shipping" &&
          c.treatment === "seller_charge",
      ),
    ).toBe(false);
    expect(second.outboundSettlementRequired).toBe(false);
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
