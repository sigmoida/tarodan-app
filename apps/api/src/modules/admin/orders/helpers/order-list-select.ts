import {
  RefundRequestStatus,
  type FiscalInvoiceType,
  type Prisma,
} from "@prisma/client";
import { LINE_CHARGE_SELECT } from "./charged-payment";

/**
 * The admin order list `select`s. Every field a row cell reads is selected
 * here and nothing more (§5): a page can hold up to 500 rows.
 */

export const PARTY_SELECT = {
  id: true,
  displayName: true,
  email: true,
  adminCode: true,
} as const satisfies Prisma.UserSelect;

export const LIST_PRODUCT_SELECT = {
  id: true,
  title: true,
  productCode: true,
  modelCode: true,
  price: true,
  brand: { select: { name: true } },
  images: {
    take: 1,
    orderBy: { sortOrder: "asc" },
    select: { cardKey: true },
  },
} as const satisfies Prisma.ProductSelect;

/** A refund request still open — the row's "refund in progress" mark. */
const CLOSED_REFUND_STATUSES: RefundRequestStatus[] = [
  RefundRequestStatus.refunded,
  RefundRequestStatus.rejected,
  RefundRequestStatus.cancelled,
];

export const LIST_OFFER_CORE_SELECT = {
  id: true,
  status: true,
  amount: true,
  expiresAt: true,
  createdAt: true,
} as const satisfies Prisma.OfferSelect;

/** An order line (product item) — with its package and shipment. */
const LIST_LINE_BASE_SELECT = {
  id: true,
  orderNumber: true,
  origin: true,
  status: true,
  cancellationType: true,
  cancelledBy: true,
  quantity: true,
  unitPrice: true,
  subtotal: true,
  totalAmount: true,
  preparingDeadline: true,
  preparingExtendedAt: true,
  deliveredAt: true,
  createdAt: true,
  checkoutGroupId: true,
  packageId: true,
  // Test-lane stamp — the row shows a "TEST" badge (the list does not hide it).
  isTest: true,
  shippingAddress: true,
  financialSnapshot: true,
  sellerCommissionAmount: true,
  buyerCommissionAmount: true,
  sellerPlatformFeeAmount: true,
  buyerServiceFeeAmount: true,
  buyer: { select: PARTY_SELECT },
  seller: { select: PARTY_SELECT },
  product: { select: LIST_PRODUCT_SELECT },
  package: { select: { packageNumber: true } },
  shipment: {
    select: {
      provider: true,
      status: true,
      trackingNumber: true,
      providerTrackingId: true,
      // Carrier hand-over stamp — the panel's cancel eligibility (preShipmentCancelBlocker).
      shippedAt: true,
    },
  },
  refundRequests: {
    where: { status: { notIn: CLOSED_REFUND_STATUSES } },
    take: 1,
    select: { id: true },
  },
  // Charge state: the row's bucket (unpaid vs real) and the cancellations
  // tab's refund state.
  ...LINE_CHARGE_SELECT,
} as const satisfies Prisma.OrderSelect;

/**
 * What a line contributes to its cart's bucket (`orderCartBucketOf`). A
 * deep-link scope shows only some lines of a group; the row's bucket still
 * reads every line through this narrow selection.
 */
export const BUCKET_LINE_SELECT = {
  id: true,
  checkoutGroupId: true,
  status: true,
  shipment: { select: { status: true } },
  ...LINE_CHARGE_SELECT,
} as const satisfies Prisma.OrderSelect;

export type BucketLine = Prisma.OrderGetPayload<{
  select: typeof BUCKET_LINE_SELECT;
}>;

/** A cart tab line: an offer order comes with its offer. */
export const LIST_LINE_SELECT = {
  ...LIST_LINE_BASE_SELECT,
  offer: { select: LIST_OFFER_CORE_SELECT },
} as const satisfies Prisma.OrderSelect;

export type ListLine = Prisma.OrderGetPayload<{
  select: typeof LIST_LINE_SELECT;
}>;

/** An order line without the offer relation — the mapper's line/package steps. */
export type ListOfferOrder = Prisma.OrderGetPayload<{
  select: typeof LIST_LINE_BASE_SELECT;
}>;

export const LIST_INVOICE_SELECT = {
  id: true,
  type: true,
  status: true,
  sourceId: true,
  invoiceNumber: true,
  ettn: true,
  pdfUrl: true,
} as const satisfies Prisma.FiscalInvoiceSelect;

export type ListInvoice = Prisma.FiscalInvoiceGetPayload<{
  select: typeof LIST_INVOICE_SELECT;
}>;

/**
 * The order's own e-documents. Return and penalty documents point their
 * `sourceId` at another table (invoice / refund request); trade and platform
 * service documents do not belong to the orders screen.
 */
export const ORDER_INVOICE_TYPES: FiscalInvoiceType[] = [
  "commission",
  "service_fee",
  "buyer_commission",
  "buyer_service_fee",
  "buyer_shipping",
  "seller_commission",
  "seller_platform_fee",
  "seller_shipping",
  "platform_sale",
  "buyer_installment_fee",
];
