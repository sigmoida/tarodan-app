export interface OrderDetail {
  id: string;
  orderNumber: string;
  status: string;
  totalAmount: number;
  commissionAmount: number;
  shippingCost: number;
  buyerFeeAmount?: number;
  sellerFeeAmount?: number;
  subtotal?: number;
  sellerNetAmount?: number;
  discountAmount?: number;
  discountCode?: string | null;
  discountBreakdown?: any;
  pricing?: {
    subtotal: number;
    shippingAmount: number;
    buyerFeeAmount: number;
    sellerFeeAmount: number;
    commissionAmount: number;
    totalAmount: number;
    sellerNetAmount: number;
    discountAmount?: number;
    discountCode?: string | null;
  };
  buyer: { id: string; displayName: string; email: string; phone?: string };
  seller: { id: string; displayName: string; email: string };
  product: {
    id: string;
    title: string;
    price: number;
    images?: Array<{ url: string }>;
  };
  shippingAddress?: any;
  payment?: { id: string; status: string; amount: number; provider: string };
  shipment?: { id: string; trackingNumber?: string; carrier?: string; status?: string };
  createdAt: string;
  updatedAt: string;
  cancelReason?: string | null;
  offerId?: string | null;
  quantity?: number | null;
  deliveredAt?: string | null;
  completedAt?: string | null;
  cancellationType?: string | null;
  activeRefundRequest?: { id: string; status: string; refundNumber?: string } | null;
}
