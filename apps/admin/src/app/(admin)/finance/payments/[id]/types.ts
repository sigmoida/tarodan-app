export interface PaymentDetail {
  id: string;
  orderId: string;
  orderNumber: string;
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
  paymentHolds?: Array<{
    id: string;
    amount: number;
    status: string;
    releaseAt?: string;
    releasedAt?: string;
  }>;
  createdAt: string;
  updatedAt: string;
  paidAt?: string;
}
