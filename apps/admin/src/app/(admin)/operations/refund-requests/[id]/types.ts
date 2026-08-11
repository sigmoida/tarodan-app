export interface HistoryEntry {
  action: string;
  by: string;
  at: string;
  details?: Record<string, any>;
}

export interface RefundRequestDetail {
  id: string;
  refundNumber: string;
  status: string;
  amount: number | string;
  refundQuantity?: number | null;
  reason: string;
  resolvedReason?: string | null;
  faultParty?: "buyer" | "seller" | "carrier" | "platform" | null;
  policyVersion?: number;
  policyFinalizedAt?: string | null;
  policyFinalizedBy?: string | null;
  financialReviewRequired?: boolean;
  description?: string | null;
  evidencePhotoUrls?: string[];
  sellerResponse?: string | null;
  decidedBy?: string | null;
  decidedAt?: string | null;
  returnProvider?: string | null;
  returnTrackingNumber?: string | null;
  /** Real Sürat return code (KargoTakipNo). */
  returnProviderTrackingId?: string | null;
  returnStatus?: string | null;
  returnShippedAt?: string | null;
  returnDeliveredAt?: string | null;
  returnCreatedAt?: string | null;
  refundedAt?: string | null;
  providerRefundId?: string | null;
  policyCode?: string;
  financialPolicySnapshot?: Record<string, unknown> | null;
  returnBillableDesi?: number;
  returnShippingAmount?: number | string;
  refundedProductAmount?: number | string;
  refundedOutboundShippingAmount?: number | string;
  refundedBuyerProtectionAmount?: number | string;
  refundedSellerFeeAmount?: number | string;
  retainedSellerPlatformFeeAmount?: number | string;
  returnShippingChargeToBuyer?: number | string;
  returnShippingChargeToSeller?: number | string;
  /** Kusur alıcıdaysa satıcıya GERİ verilen kendi kargo payı (tam iadede). */
  sellerShippingCompensationAmount?: number | string;
  /** Alıcıya geri ödenen gidiş kargosunun satıcıya yazılan borcu. */
  outboundShippingChargeToSeller?: number | string;
  requiresAdminReview?: boolean;
  penaltyReviewRequired?: boolean;
  carrierClaimRequired?: boolean;
  refundedBuyerServiceTaxAmount?: number | string;
  refundedSellerServiceTaxAmount?: number | string;
  retainedBuyerServiceTaxAmount?: number | string;
  retainedSellerServiceTaxAmount?: number | string;
  financialComponents?: RefundFinancialComponent[];
  metadata?: { history?: HistoryEntry[] } | null;
  refundProductAmount?: boolean;
  refundShippingFee?: boolean;
  refundBuyerFee?: boolean;
  refundSellerCommission?: boolean;
  returnShippingPayer?: "buyer" | "seller" | "platform" | null;
  buyerInitiatedAmicable?: boolean;
  createdAt: string;
  requester: {
    id: string;
    displayName: string;
    email: string;
    phone?: string | null;
  };
  order: {
    id: string;
    orderNumber: string;
    totalAmount: number | string;
    subtotal?: number | string | null;
    shippingCost?: number | string;
    buyerFeeAmount?: number | string;
    commissionAmount?: number | string;
    quantity?: number | null;
    unitPrice?: number | string | null;
    status: string;
    seller: {
      id: string;
      displayName: string;
      email: string;
      phone?: string | null;
    };
    product: { id: string; title: string; images?: { url: string }[] };
    payment?: { id: string; status: string; amount: number | string } | null;
    shipment?: { status: string; deliveredAt?: string | null } | null;
  };
}

export interface RefundFinancialComponent {
  id?: string;
  componentCode: string;
  treatment: string;
  netAmount: number | string;
  taxAmount: number | string;
  grossAmount: number | string;
  sourceAmount: number | string;
  quantityPortion: number | string;
}

export interface RefundDecisionPreview {
  calculationToken: string;
  resolvedReason: string;
  faultParty: "buyer" | "seller" | "carrier" | "platform";
  outboundPackageTier: "small" | "medium" | "large";
  outboundFullShippingAmount: number;
  returnTariff: {
    id: string;
    version: number;
    tier: string;
    amount: number;
  } | null;
  financials: {
    buyerRefundAmount: number;
    sellerNetEffectAmount: number;
    components: RefundFinancialComponent[];
  };
}
