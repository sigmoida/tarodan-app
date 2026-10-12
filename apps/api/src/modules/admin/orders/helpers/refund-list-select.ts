import type { Prisma } from "@prisma/client";
import { PARTY_SELECT } from "./order-list-select";

/**
 * Admin İadeler listesinin satır yükleri — liste ve Excel aynı seçimi okur.
 * Yalnız satırın gösterdiği kolonlar seçilir (bkz. docs/REFUNDS_SCREEN.md).
 */

export const REFUND_ROW_SELECT = {
  id: true,
  refundNumber: true,
  createdAt: true,
  updatedAt: true,
  status: true,
  reason: true,
  resolvedReason: true,
  description: true,
  policyCode: true,
  amount: true,
  refundQuantity: true,
  refundedAt: true,
  decidedAt: true,
  returnTrackingNumber: true,
  returnProviderTrackingId: true,
  returnStatus: true,
  financialComponents: {
    select: {
      componentCode: true,
      treatment: true,
      netAmount: true,
      grossAmount: true,
    },
  },
  order: {
    select: {
      id: true,
      orderNumber: true,
      createdAt: true,
      origin: true,
      isTest: true,
      quantity: true,
      unitPrice: true,
      subtotal: true,
      shippingAddress: true,
      // Teklif siparişinde kabul anı ilan fiyatı (`financialSnapshot.offer`).
      financialSnapshot: true,
      sellerCommissionAmount: true,
      buyerCommissionAmount: true,
      buyer: { select: PARTY_SELECT },
      seller: { select: PARTY_SELECT },
      product: {
        select: { id: true, title: true, productCode: true, price: true },
      },
      checkoutGroup: { select: { groupNumber: true } },
      shipment: { select: { trackingNumber: true, providerTrackingId: true } },
      offer: { select: { amount: true } },
    },
  },
} as const satisfies Prisma.RefundRequestSelect;

export type RefundRowPayload = Prisma.RefundRequestGetPayload<{
  select: typeof REFUND_ROW_SELECT;
}>;

/** Talebin (tek) iade denemesi — `refund-request:<id>` anahtarıyla bağlı. */
export const REFUND_ROW_ATTEMPT_SELECT = {
  id: true,
  idempotencyKey: true,
  status: true,
  amount: true,
  createdAt: true,
  finalizedAt: true,
} as const satisfies Prisma.RefundAttemptSelect;

export type RefundRowAttempt = Prisma.RefundAttemptGetPayload<{
  select: typeof REFUND_ROW_ATTEMPT_SELECT;
}>;

/** Satırın iade faturası (`FiscalInvoice` `return_invoice`). */
export const REFUND_ROW_INVOICE_SELECT = {
  id: true,
  sourceId: true,
  invoiceNumber: true,
  status: true,
  createdAt: true,
} as const satisfies Prisma.FiscalInvoiceSelect;

export type RefundRowInvoice = Prisma.FiscalInvoiceGetPayload<{
  select: typeof REFUND_ROW_INVOICE_SELECT;
}>;

export const TRADE_REFUND_SELECT = {
  id: true,
  tradeNumber: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  cancelledAt: true,
  cancelReason: true,
  adminCancelReasonCode: true,
  refundFailureReason: true,
  firstWarehouseArrivalAt: true,
  isTest: true,
  initiatorId: true,
  receiverId: true,
  initiator: { select: PARTY_SELECT },
  receiver: { select: PARTY_SELECT },
  items: {
    select: {
      side: true,
      quantity: true,
      valueAtTrade: true,
      product: { select: { id: true, title: true, productCode: true } },
    },
    orderBy: { createdAt: "asc" },
  },
  cashPayments: {
    select: {
      id: true,
      payerId: true,
      recipientId: true,
      amount: true,
      tradeFeeAmount: true,
      shippingAmount: true,
      commission: true,
      commissionTaxAmount: true,
      totalAmount: true,
      status: true,
      refundedAt: true,
      releasedAt: true,
      fullRefundEntitled: true,
      payment: { select: { id: true, status: true, provider: true } },
    },
  },
  shipments: {
    select: {
      leg: true,
      shipperId: true,
      recipientUserId: true,
      trackingNumber: true,
      providerTrackingId: true,
      status: true,
      shippedAt: true,
      deliveredAt: true,
      createdAt: true,
    },
    orderBy: { createdAt: "asc" },
  },
  refundAttempts: {
    select: {
      id: true,
      paymentId: true,
      status: true,
      amount: true,
      createdAt: true,
      finalizedAt: true,
    },
    orderBy: { createdAt: "asc" },
  },
  dispute: { select: { reason: true, createdAt: true } },
} as const satisfies Prisma.TradeSelect;

export type TradeRefundPayload = Prisma.TradeGetPayload<{
  select: typeof TRADE_REFUND_SELECT;
}>;
