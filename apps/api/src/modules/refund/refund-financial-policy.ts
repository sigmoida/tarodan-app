export type ReturnShippingPayer = "buyer" | "seller" | "platform" | null;

export interface RefundPolicyDecision {
  policyCode:
    | "seller_fault_return"
    | "buyer_remorse_return"
    | "buyer_fault_return"
    | "manual_review_return"
    | "seller_fault_cancellation"
    | "buyer_remorse_cancellation"
    | "manual_review_cancellation";
  returnShippingPayer: ReturnShippingPayer;
  refundOutboundShipping: boolean;
  refundBuyerProtectionFee: boolean;
  refundSellerPlatformFee: boolean;
  /**
   * Satıcının escrow'da kesilen KENDİ kargo payı tazmin edilsin mi? Kusur
   * alıcıdaysa (cayma/alıcı hasarı) ve gönderi hiç taşınmadıysa (iptaller)
   * satıcı kargo masrafına girmez. Tazmin yalnız TAM iadede uygulanır — kısmi
   * iadede kargo kalan adetlere de hizmet etmiştir.
   */
  compensateSellerShipping: boolean;
  /**
   * Alıcıya geri ödenen GİDİŞ kargosu satıcıya borç yazılsın mı? Sürat faturası
   * platforma gelir; kusur satıcıdaysa taşıma maliyeti platformda kalmamalı.
   */
  chargeSellerOutboundShipping: boolean;
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
  /** Satıcının escrow'da kesilen kendi kargo payı (Order.sellerShippingAmount). */
  sellerShippingAmount: number;
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
  /**
   * Satıcıya GERİ verilecek kendi kargo payı. Escrow hold'dan tam kargo düşüldüğü
   * için satıcı bu payı peşin ödemiş sayılır; kusur alıcıdaysa ya da gönderi hiç
   * taşınmadıysa iade edilir. Yalnız TAM iadede > 0.
   */
  sellerShippingCompensationAmount: number;
  /**
   * Alıcıya geri ödenen gidiş kargosunun satıcıya yazılacak borcu. Sürat faturası
   * platforma geldiği için kusur satıcıdayken taşıma maliyeti satıcıya döner.
   */
  outboundShippingChargeToSeller: number;
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
  compensateSellerShipping: false,
  chargeSellerOutboundShipping: true,
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
  compensateSellerShipping: true,
  chargeSellerOutboundShipping: false,
  requiresEvidence: false,
  requiresAdminReview: false,
  penaltyReviewRequired: false,
});

const buyerFaultReturnPolicy = (): RefundPolicyDecision => ({
  policyCode: "buyer_fault_return",
  returnShippingPayer: "buyer",
  refundOutboundShipping: false,
  refundBuyerProtectionFee: false,
  refundSellerPlatformFee: true,
  compensateSellerShipping: true,
  chargeSellerOutboundShipping: false,
  requiresEvidence: true,
  requiresAdminReview: true,
  penaltyReviewRequired: false,
});

const manualReviewReturnPolicy = (): RefundPolicyDecision => ({
  policyCode: "manual_review_return",
  returnShippingPayer: null,
  refundOutboundShipping: false,
  refundBuyerProtectionFee: false,
  refundSellerPlatformFee: false,
  compensateSellerShipping: false,
  chargeSellerOutboundShipping: false,
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

  if (reason === "buyer_damaged") {
    return buyerFaultReturnPolicy();
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
      compensateSellerShipping: true,
      chargeSellerOutboundShipping: false,
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
      compensateSellerShipping: true,
      chargeSellerOutboundShipping: false,
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
    compensateSellerShipping: false,
    chargeSellerOutboundShipping: false,
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
  // Alıcı koruma bedeli = alıcıdan ürün fiyatının ÜSTÜNE tahsil edilen ücretin
  // TAMAMI (v2: buyerCommission + buyerServiceFee = buyerFeeAmount). Yalnız
  // hizmet bedelini iade edip komisyon bileşenini tutmak, satıcı kusurlu tam
  // iadede bile alıcıyı zarara sokuyordu; `productPaid` her iki bileşeni de
  // düştüğü için politika "koruma bedeli iade edilsin" dediğinde ikisi birden
  // geri verilmelidir. (Legacy sipariş: buyerFeeAmount zaten toplamın kendisi.)
  const buyerProtectionFee = Math.max(
    0,
    input.buyerFeeAmount || input.buyerServiceFeeAmount,
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
  // Kargo, satıcı paketi başına BİR kez alınır ve paketteki tüm adetlere hizmet
  // eder; kısmi iadede oranlanamaz. Bu yüzden pay tazmini yalnız TAM iadede
  // (quantityPortion === 1) uygulanır.
  const isFullRefund = quantityPortion >= 1;
  const sellerShippingCompensationAmount =
    policy.compensateSellerShipping && isFullRefund
      ? money(Math.max(0, input.sellerShippingAmount))
      : 0;
  // Borç, alıcıya fiilen geri ödenen gidiş kargosu kadardır (kısmi iadede oranlı).
  const outboundShippingChargeToSeller = policy.chargeSellerOutboundShipping
    ? outboundShippingRefundAmount
    : 0;

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
    sellerShippingCompensationAmount,
    outboundShippingChargeToSeller,
    quantityPortion,
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function money(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
