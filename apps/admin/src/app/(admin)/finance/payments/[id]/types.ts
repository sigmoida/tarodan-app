export interface PaymentDetail {
  id: string;
  sourceType: "order" | "checkout_group" | "trade" | "unlinked";
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
  } | null;
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
  trade?: TradePaymentDetail | null;
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

export interface TradePaymentItem {
  id: string;
  title: string;
  quantity: number;
  valueAtTrade: number;
}

export interface TradePaymentParty {
  id: string;
  displayName: string;
  email: string;
}

export interface TradePaymentDetail {
  id: string;
  tradeNumber: string;
  status: string;
  pricingVersion: string;
  payer: TradePaymentParty | null;
  counterparty: TradePaymentParty | null;
  initiator: TradePaymentParty;
  receiver: TradePaymentParty;
  initiatorItems: TradePaymentItem[];
  receiverItems: TradePaymentItem[];
  currentPayment: {
    id: string;
    payerId: string;
    recipientId: string | null;
    cashDifferenceAmount: number;
    tradeFeeAmount: number;
    shippingAmount: number;
    legacyCommissionAmount: number;
    legacyCommissionTaxAmount: number;
    totalAmount: number;
    status: string;
    refundedAt?: string | null;
  };
  payments: Array<{
    id: string;
    payerId: string;
    totalAmount: number;
    status: string;
    refundedAt?: string | null;
  }>;
  refundableTotal: number;
}
