export interface PaymentDetail {
  id: string;
  orderId: string | null;
  orderNumber: string | null;
  amount: number;
  currency: string;
  provider: string;
  status: string;
  failureReason?: string;
  providerPaymentId?: string;
  providerConversationId?: string;
  metadata?: any;
  order?: {
    id: string;
    orderNumber: string;
    status: string;
    totalAmount: number;
    commissionAmount: number;
    buyer: { id: string; displayName: string; email: string };
    seller: { id: string; displayName: string; email: string };
    product: { id: string; title: string };
    shippingAddress?: any;
  };
  /** Sepet ödemesi: grup kimliği + kapsanan siparişler (R3 — ödeme→grup yönü). */
  group?: {
    id: string;
    groupNumber: string;
    totalAmount: number;
    buyer: { id: string; displayName: string; email: string } | null;
    orders: Array<{
      id: string;
      orderNumber: string;
      status: string;
      totalAmount: number;
      sellerName: string | null;
      productTitle: string | null;
      refundedTotal: number;
    }>;
  } | null;
  /** Ödemeye karşı başarıyla sonuçlanmış iade denemelerinin toplamı. */
  refundedTotal?: number;
  paymentHolds?: Array<{
    id: string;
    orderId: string;
    orderNumber: string | null;
    sellerId: string;
    sellerName: string | null;
    amount: number;
    refundedAmount: number;
    frozenByRefundId: string | null;
    status: string;
    releaseAt?: string;
    releasedAt?: string;
  }>;
  createdAt: string;
  updatedAt: string;
  paidAt?: string;
}
