export type ReturnShippingPayer = "buyer" | "seller" | "platform" | null;

export interface RefundPolicyDecision {
  policyCode:
    | "seller_fault_return"
    | "buyer_remorse_return"
    | "manual_review_return"
    | "seller_fault_cancellation"
    | "buyer_remorse_cancellation"
    | "manual_review_cancellation";
  returnShippingPayer: ReturnShippingPayer;
  refundOutboundShipping: boolean;
  refundBuyerProtectionFee: boolean;
  refundSellerPlatformFee: boolean;
  requiresEvidence: boolean;
  requiresAdminReview: boolean;
  penaltyReviewRequired: boolean;
}

export interface RefundFinancialInput {
  totalAmount: number;
  buyerShippingAmount: number;
  buyerFeeAmount: number;
  buyerServiceFeeAmount: number;
  sellerFeeAmount: number;
  sellerCommissionAmount: number;
  sellerPlatformFeeAmount: number;
  returnShippingAmount: number;
  orderQuantity: number;
  refundQuantity: number;
}

export interface RefundFinancialResult {
  productRefundAmount: number;
  outboundShippingRefundAmount: number;
  buyerProtectionRefundAmount: number;
  returnShippingAmount: number;
  returnShippingChargeToBuyer: number;
  returnShippingChargeToSeller: number;
  buyerRefundAmount: number;
  sellerFeeRefundAmount: number;
  sellerPlatformFeeRetainedAmount: number;
  quantityPortion: number;
}

const SELLER_FAULT_RETURN_REASONS = new Set([
  "not_as_described",
  "wrong_item",
  "damaged",
  "missing_parts",
  "counterfeit",
  "defective",
]);

const PENALTY_REVIEW_REASONS = new Set(["wrong_item", "counterfeit"]);

const BUYER_REMORSE_CANCELLATION_REASONS = new Set([
  "wrong_product_selected",
  "changed_mind",
  "wrong_card",
  "price_changed_mind",
  "unavailable_at_address",
]);

const sellerFaultReturnPolicy = (reason: string): RefundPolicyDecision => ({
  policyCode: "seller_fault_return",
  returnShippingPayer: "seller",
  refundOutboundShipping: true,
  refundBuyerProtectionFee: true,
  refundSellerPlatformFee: false,
  requiresEvidence: true,
  requiresAdminReview: true,
  penaltyReviewRequired: PENALTY_REVIEW_REASONS.has(reason),
});

const buyerRemorseReturnPolicy = (): RefundPolicyDecision => ({
  policyCode: "buyer_remorse_return",
  returnShippingPayer: "buyer",
  refundOutboundShipping: false,
  refundBuyerProtectionFee: false,
  refundSellerPlatformFee: true,
  requiresEvidence: false,
  requiresAdminReview: false,
  penaltyReviewRequired: false,
});

const manualReviewReturnPolicy = (): RefundPolicyDecision => ({
  policyCode: "manual_review_return",
  returnShippingPayer: null,
  refundOutboundShipping: false,
  refundBuyerProtectionFee: false,
  refundSellerPlatformFee: false,
  requiresEvidence: true,
  requiresAdminReview: true,
  penaltyReviewRequired: false,
});

export function resolveReturnPolicy(reason: string): RefundPolicyDecision {
  if (SELLER_FAULT_RETURN_REASONS.has(reason)) {
    return sellerFaultReturnPolicy(reason);
  }

  if (reason === "changed_mind") {
    return buyerRemorseReturnPolicy();
  }

  return manualReviewReturnPolicy();
}

export function resolveCancellationPolicy(
  reason: string,
): RefundPolicyDecision {
  if (reason === "delivery_delayed") {
    return {
      policyCode: "seller_fault_cancellation",
      returnShippingPayer: null,
      refundOutboundShipping: true,
      refundBuyerProtectionFee: true,
      refundSellerPlatformFee: false,
      requiresEvidence: false,
      requiresAdminReview: false,
      penaltyReviewRequired: false,
    };
  }

  if (BUYER_REMORSE_CANCELLATION_REASONS.has(reason)) {
    return {
      policyCode: "buyer_remorse_cancellation",
      returnShippingPayer: null,
      refundOutboundShipping: true,
      refundBuyerProtectionFee: false,
      refundSellerPlatformFee: true,
      requiresEvidence: false,
      requiresAdminReview: false,
      penaltyReviewRequired: false,
    };
  }

  return {
    policyCode: "manual_review_cancellation",
    returnShippingPayer: null,
    refundOutboundShipping: false,
    refundBuyerProtectionFee: false,
    refundSellerPlatformFee: false,
    requiresEvidence: true,
    requiresAdminReview: true,
    penaltyReviewRequired: false,
  };
}

export function calculateRefundFinancials(
  policy: RefundPolicyDecision,
  input: RefundFinancialInput,
): RefundFinancialResult {
  const quantityPortion = clamp(
    input.orderQuantity > 0 ? input.refundQuantity / input.orderQuantity : 0,
    0,
    1,
  );
  const buyerProtectionFee = Math.max(
    0,
    input.buyerServiceFeeAmount || input.buyerFeeAmount,
  );
  const productPaid = Math.max(
    0,
    input.totalAmount - input.buyerShippingAmount - input.buyerFeeAmount,
  );
  const sellerCommission = Math.max(0, input.sellerCommissionAmount);
  const sellerPlatformFee =
    input.sellerCommissionAmount + input.sellerPlatformFeeAmount > 0
      ? Math.max(0, input.sellerPlatformFeeAmount)
      : Math.max(0, input.sellerFeeAmount);

  const productRefundAmount = money(productPaid * quantityPortion);
  const outboundShippingRefundAmount = policy.refundOutboundShipping
    ? money(Math.max(0, input.buyerShippingAmount) * quantityPortion)
    : 0;
  const buyerProtectionRefundAmount = policy.refundBuyerProtectionFee
    ? money(buyerProtectionFee * quantityPortion)
    : 0;
  const returnShippingAmount = money(Math.max(0, input.returnShippingAmount));
  const returnShippingChargeToBuyer =
    policy.returnShippingPayer === "buyer" ? returnShippingAmount : 0;
  const returnShippingChargeToSeller =
    policy.returnShippingPayer === "seller" ? returnShippingAmount : 0;
  const sellerFeeRefundAmount = money(
    sellerCommission * quantityPortion +
      (policy.refundSellerPlatformFee
        ? sellerPlatformFee * quantityPortion
        : 0),
  );

  return {
    productRefundAmount,
    outboundShippingRefundAmount,
    buyerProtectionRefundAmount,
    returnShippingAmount,
    returnShippingChargeToBuyer,
    returnShippingChargeToSeller,
    buyerRefundAmount: money(
      Math.max(
        0,
        productRefundAmount +
          outboundShippingRefundAmount +
          buyerProtectionRefundAmount -
          returnShippingChargeToBuyer,
      ),
    ),
    sellerFeeRefundAmount,
    sellerPlatformFeeRetainedAmount: policy.refundSellerPlatformFee
      ? 0
      : money(sellerPlatformFee * quantityPortion),
    quantityPortion,
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function money(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
