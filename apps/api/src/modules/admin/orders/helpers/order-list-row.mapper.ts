import { Prisma } from "@prisma/client";
import type {
  AdminOrderInvoice,
  AdminOrderLine,
  AdminOrderLineProduct,
  AdminOrderListRow,
  AdminOrderOfferInfo,
  AdminOrderPackage,
  AdminOrderParty,
} from "@tarodan/types";
import { compareOfferToListing } from "../../../order/helpers/order-offer-snapshot";
import { isInvoiceDownloadable } from "../../finance/invoice-downloadable";
import { offerEffectiveStatus } from "./offer-effective-status";
import type {
  ListInvoice,
  ListLine,
  ListOffer,
  ListOfferOrder,
  PARTY_SELECT,
  LIST_PRODUCT_SELECT,
  LIST_OFFER_CORE_SELECT,
} from "./order-list-select";

/**
 * Admin sipariş listesinin satır eşlemesi — Prisma yükünden `@tarodan/types`
 * sözleşmesine. Saf: görsel URL çözümü ve faturalar dışarıdan verilir.
 * Para `Prisma.Decimal` ile toplanır, `toNumber()` yalnız burada (sınırda).
 */

export interface RowMapContext {
  now: Date;
  imageUrl: (keyOrUrl: string | null | undefined) => string | null;
  /** `ElogoInvoice.sourceId` → belgeler (paket id'si ya da eski sipariş id'si). */
  invoicesBySource: ReadonlyMap<string, readonly ListInvoice[]>;
}

export interface CartHead {
  kind: "group" | "order";
  id: string;
  number: string;
  createdAt: Date;
}

type Party = Prisma.UserGetPayload<{ select: typeof PARTY_SELECT }>;
type Product = Prisma.ProductGetPayload<{
  select: typeof LIST_PRODUCT_SELECT;
}>;
type OfferCore = Prisma.OfferGetPayload<{
  select: typeof LIST_OFFER_CORE_SELECT;
}>;

const GUEST_SYSTEM_EMAIL = "guest@tarodan.system";
const GUEST_SYSTEM_NAME = "GUEST_SYSTEM";

const money = (value: Prisma.Decimal | number | null | undefined) =>
  new Prisma.Decimal(value ?? 0);

const text = (value: unknown): string | null =>
  typeof value === "string" && value.trim() ? value : null;

function partyOf(user: Party): AdminOrderParty {
  return {
    id: user.id,
    displayName: user.displayName ?? "",
    email: user.email ?? null,
    code: user.adminCode ?? null,
    isGuest: false,
  };
}

/**
 * Misafir siparişinde alıcı ortak sistem kullanıcısıdır; gerçek ad/e-posta
 * teslimat adresi snapshot'ındadır. Kullanıcı kodu ve linki üretilmez.
 */
function buyerOf(user: Party, shippingAddress: unknown): AdminOrderParty {
  const address =
    shippingAddress && typeof shippingAddress === "object"
      ? (shippingAddress as Record<string, unknown>)
      : {};
  const isGuest =
    user.email === GUEST_SYSTEM_EMAIL ||
    user.displayName === GUEST_SYSTEM_NAME ||
    address.isGuestOrder === true;
  if (!isGuest) return partyOf(user);
  const email = text(address.guestEmail) ?? text(address.email);
  const name = text(address.guestName) ?? text(address.fullName);
  return {
    id: user.id,
    displayName: name ?? email ?? "",
    email: email ?? user.email ?? null,
    code: null,
    isGuest: true,
  };
}

function productOf(
  product: Product,
  ctx: RowMapContext,
): AdminOrderLineProduct {
  return {
    id: product.id,
    title: product.title,
    productCode: product.productCode ?? null,
    modelCode: product.modelCode ?? null,
    brandName: product.brand?.name ?? null,
    imageUrl: ctx.imageUrl(product.images[0]?.cardKey),
  };
}

function lineOf(order: ListOfferOrder, ctx: RowMapContext): AdminOrderLine {
  const quantity = order.quantity > 0 ? order.quantity : 1;
  const subtotal = order.subtotal ?? money(order.unitPrice).times(quantity);
  const unitPrice = order.unitPrice ?? subtotal.dividedBy(quantity);
  return {
    orderId: order.id,
    orderNumber: order.orderNumber,
    status: order.status,
    cancellationType: order.cancellationType ?? null,
    cancelledBy: order.cancelledBy ?? null,
    quantity,
    unitPrice: money(unitPrice).toNumber(),
    subtotal: money(subtotal).toNumber(),
    totalAmount: money(order.totalAmount).toNumber(),
    preparingDeadline: order.preparingDeadline?.toISOString() ?? null,
    deliveredAt: order.deliveredAt?.toISOString() ?? null,
    hasActiveRefund: order.refundRequests.length > 0,
    product: productOf(order.product, ctx),
  };
}

function invoiceOf(invoice: ListInvoice): AdminOrderInvoice {
  return {
    id: invoice.id,
    type: invoice.type,
    status: invoice.status,
    invoiceNumber: invoice.invoiceNumber ?? null,
    hasPdf: isInvoiceDownloadable(invoice),
  };
}

/** Paket belgeleri: paket anahtarlı + (eski) sipariş anahtarlı, tekrarsız. */
function packageInvoices(
  packageId: string | null,
  orders: readonly ListOfferOrder[],
  ctx: RowMapContext,
): AdminOrderInvoice[] {
  const sources = [
    ...(packageId ? [packageId] : []),
    ...orders.map((order) => order.id),
  ];
  const seen = new Set<string>();
  const result: AdminOrderInvoice[] = [];
  for (const source of sources) {
    for (const invoice of ctx.invoicesBySource.get(source) ?? []) {
      if (seen.has(invoice.id)) continue;
      seen.add(invoice.id);
      result.push(invoiceOf(invoice));
    }
  }
  return result;
}

function packagesOf(
  orders: readonly ListOfferOrder[],
  ctx: RowMapContext,
): AdminOrderPackage[] {
  const byKey = new Map<string, ListOfferOrder[]>();
  for (const order of orders) {
    const key = order.packageId ?? `seller:${order.seller.id}`;
    byKey.set(key, [...(byKey.get(key) ?? []), order]);
  }
  return [...byKey.entries()].map(([key, members]) => {
    const head = members[0];
    // Paketin koli kargosu tektir; kayıt sipariş başına tutulsa da aynı gönderi.
    const shipment = members.find((m) => m.shipment)?.shipment ?? null;
    return {
      key,
      packageNumber: head.package?.packageNumber ?? null,
      seller: partyOf(head.seller),
      shipment: shipment
        ? {
            provider: shipment.provider,
            trackingNumber:
              shipment.providerTrackingId ?? shipment.trackingNumber ?? null,
            status: shipment.status,
            shippedAt: shipment.shippedAt?.toISOString() ?? null,
          }
        : null,
      invoices: packageInvoices(head.packageId, members, ctx),
      lines: members.map((member) => lineOf(member, ctx)),
    };
  });
}

function offerInfoOf(params: {
  offer: OfferCore;
  product: Product;
  seller: Party;
  /** Siparişe dönmüşse snapshot'ı; dönmemişse `undefined` (canlı karşılaştırma). */
  order?: { financialSnapshot: Prisma.JsonValue };
  ctx: RowMapContext;
}): AdminOrderOfferInfo {
  const { offer, product, seller, order, ctx } = params;
  const offerAmount = money(offer.amount).toNumber();
  const comparison = compareOfferToListing({
    financialSnapshot: order?.financialSnapshot ?? null,
    currentListingPrice: money(product.price).toNumber(),
    offerAmount,
  });
  return {
    id: offer.id,
    status: offerEffectiveStatus(offer, ctx.now),
    amount: offerAmount,
    listingPrice: comparison.listingPrice,
    // Sipariş yokken güncel ilan fiyatı zaten karşılaştırılan fiyattır.
    listingPriceApproximate: order ? comparison.approximate : false,
    priceDifference: comparison.difference,
    expiresAt: offer.expiresAt.toISOString(),
    createdAt: offer.createdAt.toISOString(),
    product: productOf(product, ctx),
    seller: partyOf(seller),
  };
}

function cartRowOf(
  head: CartHead,
  orders: readonly ListOfferOrder[],
  offer: OfferCore | null,
  ctx: RowMapContext,
): AdminOrderListRow {
  const first = orders[0];
  const sum = (pick: (order: ListOfferOrder) => Prisma.Decimal) =>
    orders.reduce((acc, order) => acc.plus(pick(order)), money(0));
  const lines = packagesOf(orders, ctx);
  return {
    kind: head.kind,
    id: head.id,
    number: head.number,
    origin: first.origin,
    createdAt: head.createdAt.toISOString(),
    detailOrderId: first.id,
    buyer: buyerOf(first.buyer, first.shippingAddress),
    totalAmount: sum((o) => money(o.totalAmount)).toNumber(),
    subtotal: lines
      .flatMap((pkg) => pkg.lines)
      .reduce((acc, line) => acc.plus(line.subtotal), money(0))
      .toNumber(),
    fees: {
      salesCommission: sum((o) =>
        money(o.sellerCommissionAmount).plus(money(o.buyerCommissionAmount)),
      ).toNumber(),
      platformFee: sum((o) =>
        money(o.sellerPlatformFeeAmount).plus(money(o.buyerServiceFeeAmount)),
      ).toNumber(),
    },
    offer: offer
      ? offerInfoOf({
          offer,
          product: first.product,
          seller: first.seller,
          order: first,
          ctx,
        })
      : null,
    packages: lines,
  };
}

/** Sepet sekmelerinin satırı: grup ya da grupsuz tekil sipariş. */
export function mapCartRow(
  head: CartHead,
  lines: readonly ListLine[],
  ctx: RowMapContext,
): AdminOrderListRow {
  return cartRowOf(head, lines, lines[0]?.offer ?? null, ctx);
}

/**
 * Teklif sekmesinin satırı. Siparişe dönmüş teklif sipariş satırıdır (ORD);
 * dönmemiş teklif kendi satırıdır, paketi olmaz.
 */
export function mapOfferRow(
  offer: ListOffer,
  ctx: RowMapContext,
): AdminOrderListRow {
  if (offer.order) {
    return cartRowOf(
      {
        kind: "order",
        id: offer.order.id,
        number: offer.order.orderNumber,
        createdAt: offer.order.createdAt,
      },
      [offer.order],
      offer,
      ctx,
    );
  }
  const amount = money(offer.amount).toNumber();
  return {
    kind: "offer",
    id: offer.id,
    number: null,
    origin: "offer",
    createdAt: offer.createdAt.toISOString(),
    detailOrderId: null,
    buyer: partyOf(offer.buyer),
    totalAmount: amount,
    subtotal: amount,
    fees: { salesCommission: 0, platformFee: 0 },
    offer: offerInfoOf({
      offer,
      product: offer.product,
      seller: offer.seller,
      ctx,
    }),
    packages: [],
  };
}
