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
  description?: string | null;
  evidencePhotoUrls?: string[];
  sellerResponse?: string | null;
  decidedBy?: string | null;
  decidedAt?: string | null;
  returnProvider?: string | null;
  returnTrackingNumber?: string | null;
  returnStatus?: string | null;
  returnShippedAt?: string | null;
  returnDeliveredAt?: string | null;
  returnCreatedAt?: string | null;
  refundedAt?: string | null;
  providerRefundId?: string | null;
  metadata?: { history?: HistoryEntry[] } | null;
  refundProductAmount?: boolean;
  refundShippingFee?: boolean;
  refundBuyerFee?: boolean;
  refundSellerCommission?: boolean;
  returnShippingPayer?: 'buyer' | 'seller' | 'platform' | null;
  buyerInitiatedAmicable?: boolean;
  createdAt: string;
  requester: { id: string; displayName: string; email: string; phone?: string | null };
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
    seller: { id: string; displayName: string; email: string; phone?: string | null };
    product: { id: string; title: string; images?: { url: string }[] };
    payment?: { id: string; status: string; amount: number | string } | null;
    shipment?: { status: string; deliveredAt?: string | null } | null;
  };
}
