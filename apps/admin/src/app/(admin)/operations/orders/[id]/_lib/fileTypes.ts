/**
 * GET /admin/orders/:id/file — grup dosyası payload'ı. Sipariş id'si sunucuda
 * grup çatısına çözülür; ekran her şeyi (ödeme, paket kargoları, sipariş başına
 * finans/escrow/iade) bu tek payload'dan okur.
 */

export interface OrderFileFinance {
  subtotal: number;
  discountAmount: number;
  discountCode: string | null;
  platformFundedDiscount: number;
  buyerShippingAmount: number;
  sellerShippingAmount: number;
  buyerFeeAmount: number;
  buyerCommissionAmount: number;
  buyerServiceFeeAmount: number;
  sellerFeeAmount: number;
  sellerCommissionAmount: number;
  sellerPlatformFeeAmount: number;
  commissionAmount: number;
  taxAmount: number;
  withholdingTaxAmount: number;
  totalAmount: number;
  sellerNetAmount: number;
}

export interface OrderFileEscrow {
  id: string;
  amount: number;
  status: string;
  releaseAt: string | null;
  releasedAt: string | null;
  refundedAmount: number;
  frozenByRefundId: string | null;
}

export interface OrderFileRefundRequest {
  id: string;
  refundNumber: string;
  status: string;
  reason: string;
  amount: number;
  refundQuantity: number;
  createdAt: string;
  refundedAt: string | null;
}

export interface OrderFileLedger {
  status: string;
  sellerCommission: number;
  buyerFee: number;
  refundedSellerCommission: number;
  refundedBuyerFee: number;
}

export interface OrderFileEntry {
  id: string;
  orderNumber: string;
  status: string;
  cancellationType: string | null;
  cancelReason: string | null;
  createdAt: string;
  deliveredAt: string | null;
  completedAt: string | null;
  confirmationDeadline: string | null;
  buyerConfirmedAt: string | null;
  product: { id: string; title: string | null; imageUrl: string | null };
  quantity: number;
  unitPrice: number | null;
  finance: OrderFileFinance;
  escrow: OrderFileEscrow | null;
  refundRequests: OrderFileRefundRequest[];
  ledger: OrderFileLedger | null;
}

export interface OrderFilePackage {
  packageId: string | null;
  seller: {
    id: string;
    displayName: string | null;
    email: string | null;
    sellerType: string | null;
    isVerified: boolean;
  } | null;
  shipping: {
    fullShippingAmount: number;
    buyerShippingAmount: number;
    sellerShippingAmount: number;
    billableDesi: number | null;
  };
  shipment: {
    id: string;
    provider: string;
    status: string;
    trackingNumber: string | null;
    providerTrackingId: string | null;
    shippedAt: string | null;
    deliveredAt: string | null;
  } | null;
  orders: OrderFileEntry[];
}

export interface OrderGroupFile {
  shippingAddress: Record<string, unknown> | null;
  group: {
    kind: "group" | "synthetic";
    id: string;
    groupNumber: string;
    createdAt: string;
    itemCount: number;
    packageCount: number;
    isMultiSeller: boolean;
    totals: {
      subtotal: number;
      shippingCost: number;
      discountAmount: number;
      totalAmount: number;
    };
  };
  buyer: {
    id: string;
    displayName: string | null;
    email: string | null;
    phone?: string | null;
    isVerified?: boolean;
    isGuest?: boolean;
  } | null;
  payment: {
    id: string;
    status: string;
    amount: number;
    provider: string | null;
    providerPaymentId: string | null;
    paidAt: string | null;
    coversWholeGroup: boolean;
    refundedTotal: number;
  } | null;
  packages: OrderFilePackage[];
}

/** Açık iade: refunded/rejected/cancelled dışındaki ilk talep. */
export const activeRefundOf = (
  entry: OrderFileEntry,
): OrderFileRefundRequest | null =>
  entry.refundRequests.find(
    (r) => !["refunded", "rejected", "cancelled"].includes(r.status),
  ) ?? null;
