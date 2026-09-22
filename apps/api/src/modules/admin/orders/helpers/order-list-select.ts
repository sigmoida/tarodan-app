import {
  RefundRequestStatus,
  type ElogoInvoiceType,
  type Prisma,
} from "@prisma/client";

/**
 * Admin sipariş listesinin `select`'leri. Satır hücrelerinin okuduğu her alan
 * burada seçilir, fazlası seçilmez (§5): sayfa 500 satıra kadar çıkabilir.
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

/** Kapanmamış iade talebi — satırda "iade sürecinde" işareti. */
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

/** Bir sipariş satırı (ürün kalemi) — paket ve kargo bilgisiyle. */
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
  deliveredAt: true,
  createdAt: true,
  checkoutGroupId: true,
  packageId: true,
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
      // Kargoya devir mührü — panelin iptal uygunluğu (preShipmentCancelBlocker).
      shippedAt: true,
    },
  },
  refundRequests: {
    where: { status: { notIn: CLOSED_REFUND_STATUSES } },
    take: 1,
    select: { id: true },
  },
} as const satisfies Prisma.OrderSelect;

/** Sepet sekmelerinin satırı: teklif siparişinde teklifin kendisiyle. */
export const LIST_LINE_SELECT = {
  ...LIST_LINE_BASE_SELECT,
  offer: { select: LIST_OFFER_CORE_SELECT },
} as const satisfies Prisma.OrderSelect;

export type ListLine = Prisma.OrderGetPayload<{
  select: typeof LIST_LINE_SELECT;
}>;

/** Teklif sekmesinin satırı: teklif + (varsa) siparişi. */
export const LIST_OFFER_SELECT = {
  ...LIST_OFFER_CORE_SELECT,
  buyer: { select: PARTY_SELECT },
  seller: { select: PARTY_SELECT },
  product: { select: LIST_PRODUCT_SELECT },
  order: { select: LIST_LINE_BASE_SELECT },
} as const satisfies Prisma.OfferSelect;

export type ListOfferOrder = Prisma.OrderGetPayload<{
  select: typeof LIST_LINE_BASE_SELECT;
}>;

export type ListOffer = Prisma.OfferGetPayload<{
  select: typeof LIST_OFFER_SELECT;
}>;

export const LIST_INVOICE_SELECT = {
  id: true,
  type: true,
  status: true,
  sourceId: true,
  invoiceNumber: true,
  ettn: true,
  pdfUrl: true,
} as const satisfies Prisma.ElogoInvoiceSelect;

export type ListInvoice = Prisma.ElogoInvoiceGetPayload<{
  select: typeof LIST_INVOICE_SELECT;
}>;

/**
 * Siparişin kendi e-belgeleri. İade ve ceza belgelerinin `sourceId`'si başka
 * tabloyu gösterir (fatura / iade talebi), takas ve platform hizmeti belgeleri
 * sipariş ekranına ait değildir.
 */
export const ORDER_INVOICE_TYPES: ElogoInvoiceType[] = [
  "commission",
  "service_fee",
  "buyer_commission",
  "buyer_service_fee",
  "buyer_shipping",
  "seller_commission",
  "seller_platform_fee",
  "seller_shipping",
  "platform_sale",
];
