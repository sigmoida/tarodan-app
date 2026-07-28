import {
  calculateRefundFinancials,
  resolveCancellationPolicy,
  resolveReturnPolicy,
} from "./refund-financial-policy";

describe("refund financial policy", () => {
  const orderAmounts = {
    totalAmount: 1180,
    buyerShippingAmount: 130,
    buyerFeeAmount: 50,
    buyerServiceFeeAmount: 50,
    sellerFeeAmount: 100,
    sellerCommissionAmount: 40,
    sellerPlatformFeeAmount: 60,
    returnShippingAmount: 180,
    orderQuantity: 1,
    refundQuantity: 1,
  };

  it.each([
    "not_as_described",
    "wrong_item",
    "damaged",
    "missing_parts",
    "counterfeit",
    "defective",
  ])(
    "treats %s as seller fault requiring evidence and admin review",
    (reason) => {
      const decision = resolveReturnPolicy(reason);

      expect(decision).toMatchObject({
        policyCode: "seller_fault_return",
        returnShippingPayer: "seller",
        refundOutboundShipping: true,
        refundBuyerProtectionFee: true,
        refundSellerPlatformFee: false,
        requiresEvidence: true,
        requiresAdminReview: true,
      });
    },
  );

  it("flags wrong-item and counterfeit claims for non-monetary penalty review", () => {
    expect(resolveReturnPolicy("wrong_item").penaltyReviewRequired).toBe(true);
    expect(resolveReturnPolicy("counterfeit").penaltyReviewRequired).toBe(true);
    expect(resolveReturnPolicy("damaged").penaltyReviewRequired).toBe(false);
  });

  it("automatically accepts buyer-remorse returns at the buyer's shipping cost", () => {
    expect(resolveReturnPolicy("changed_mind")).toMatchObject({
      policyCode: "buyer_remorse_return",
      returnShippingPayer: "buyer",
      refundOutboundShipping: false,
      refundBuyerProtectionFee: false,
      refundSellerPlatformFee: true,
      requiresEvidence: false,
      requiresAdminReview: false,
    });
  });

  it("refunds outbound shipping but retains buyer protection before handover", () => {
    expect(resolveCancellationPolicy("wrong_product_selected")).toMatchObject({
      policyCode: "buyer_remorse_cancellation",
      returnShippingPayer: null,
      refundOutboundShipping: true,
      refundBuyerProtectionFee: false,
      refundSellerPlatformFee: true,
      requiresAdminReview: false,
    });
  });

  it("retains seller platform fee for delivery-delay cancellation", () => {
    expect(resolveCancellationPolicy("delivery_delayed")).toMatchObject({
      policyCode: "seller_fault_cancellation",
      refundOutboundShipping: true,
      refundBuyerProtectionFee: true,
      refundSellerPlatformFee: false,
      requiresAdminReview: false,
    });
  });

  it("computes exact seller-fault return components", () => {
    const result = calculateRefundFinancials(
      resolveReturnPolicy("damaged"),
      orderAmounts,
    );

    expect(result).toEqual({
      productRefundAmount: 1000,
      outboundShippingRefundAmount: 130,
      buyerProtectionRefundAmount: 50,
      returnShippingAmount: 180,
      returnShippingChargeToBuyer: 0,
      returnShippingChargeToSeller: 180,
      buyerRefundAmount: 1180,
      sellerFeeRefundAmount: 40,
      sellerPlatformFeeRetainedAmount: 60,
      quantityPortion: 1,
    });
  });

  it("deducts buyer-paid return shipping from buyer-remorse refund", () => {
    const result = calculateRefundFinancials(
      resolveReturnPolicy("changed_mind"),
      orderAmounts,
    );

    expect(result).toMatchObject({
      productRefundAmount: 1000,
      outboundShippingRefundAmount: 0,
      buyerProtectionRefundAmount: 0,
      returnShippingChargeToBuyer: 180,
      returnShippingChargeToSeller: 0,
      buyerRefundAmount: 820,
      sellerFeeRefundAmount: 100,
      sellerPlatformFeeRetainedAmount: 0,
    });
  });

  it("charges one return shipment while prorating partial item components", () => {
    const result = calculateRefundFinancials(
      resolveReturnPolicy("changed_mind"),
      {
        ...orderAmounts,
        orderQuantity: 2,
        refundQuantity: 1,
      },
    );

    expect(result).toMatchObject({
      productRefundAmount: 500,
      returnShippingChargeToBuyer: 180,
      buyerRefundAmount: 320,
      sellerFeeRefundAmount: 50,
      quantityPortion: 0.5,
    });
  });

  it("never allows buyer-paid return shipping to make the refund negative", () => {
    const result = calculateRefundFinancials(
      resolveReturnPolicy("changed_mind"),
      {
        ...orderAmounts,
        totalAmount: 100,
        buyerShippingAmount: 0,
        buyerFeeAmount: 0,
        buyerServiceFeeAmount: 0,
        returnShippingAmount: 180,
      },
    );

    expect(result.buyerRefundAmount).toBe(0);
  });
});
