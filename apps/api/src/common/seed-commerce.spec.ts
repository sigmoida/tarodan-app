import { buildSeedOrderFinancialState } from "../../prisma/seed-commerce";

describe("seed commerce normalization", () => {
  it("backfills legacy shipping, commission, and financial snapshots", () => {
    const state = buildSeedOrderFinancialState({
      orderNumber: "ORD-SEED-1",
      productId: "product-1",
      quantity: 2,
      subtotal: 200,
      totalAmount: 240,
      shippingCost: 30,
      commissionAmount: 10,
      taxAmount: 0,
      tariffId: "tariff-1",
      tariffVersion: 3,
    });

    expect(state).toEqual(
      expect.objectContaining({
        quantity: 2,
        unitPrice: 100,
        subtotal: 200,
        buyerShippingAmount: 30,
        sellerShippingAmount: 0,
        fullShippingAmount: 30,
        buyerFeeAmount: 0,
        sellerFeeAmount: 10,
        sellerCommissionAmount: 10,
      }),
    );
    expect(state.financialSnapshot).toEqual(
      expect.objectContaining({
        version: 1,
        pricing: expect.objectContaining({
          productId: "product-1",
          quantity: 2,
          unitPrice: 100,
          totalAmount: 240,
        }),
        shipping: {
          tariffId: "tariff-1",
          tariffVersion: 3,
          fullAmount: 30,
          buyerAmount: 30,
          sellerAmount: 0,
        },
        commission: expect.objectContaining({
          sellerFeeAmount: 10,
          sellerCommissionAmount: 10,
        }),
      }),
    );
  });

  it("preserves explicit buyer and seller fee splits", () => {
    const state = buildSeedOrderFinancialState({
      orderNumber: "ORD-SEED-2",
      productId: "product-2",
      totalAmount: 170,
      subtotal: 120,
      shippingCost: 30,
      buyerShippingAmount: 20,
      sellerShippingAmount: 10,
      commissionAmount: 20,
      buyerFeeAmount: 5,
      buyerCommissionAmount: 2,
      buyerServiceFeeAmount: 3,
      sellerFeeAmount: 15,
      sellerCommissionAmount: 10,
      sellerPlatformFeeAmount: 5,
      tariffId: "tariff-1",
      tariffVersion: 1,
    });

    expect(state).toEqual(
      expect.objectContaining({
        buyerShippingAmount: 20,
        sellerShippingAmount: 10,
        fullShippingAmount: 30,
        buyerFeeAmount: 5,
        sellerFeeAmount: 15,
        buyerCommissionAmount: 2,
        buyerServiceFeeAmount: 3,
        sellerCommissionAmount: 10,
        sellerPlatformFeeAmount: 5,
      }),
    );
  });
});
