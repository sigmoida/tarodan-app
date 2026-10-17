import type { CancellationActor } from "@prisma/client";
import type { MessageKey } from "@tarodan/i18n";
import {
  formatEmailDate,
  formatEmailPrice,
} from "../../../common/helpers/email-template-renderer";
import type {
  MailInternalNoticePayload,
  MailNoticeFact,
  MailNoticeItem,
} from "./mail-internal-notice.types";

/**
 * Olay yerlerinin kullandığı bildirim kurucuları — her olayın personel
 * e-postasında NE göründüğü tek yerde. Olay yeri yalnız elindeki alanları
 * verir; hangi olgunun gösterileceği, tutarın nasıl biçimleneceği ve panelde
 * hangi sayfanın açılacağı burada karar verilir.
 *
 * Kişisel veri kuralı (docs/MAIL_ROUTING.md): kimlik no, IBAN, tam adres ve
 * mesaj gövdesi girmez; serbest metin yalnız `excerpt` ile kısaltılarak.
 */

/** Serbest metin alıntısının üst sınırı (karakter). */
export const MAIL_NOTICE_EXCERPT_LENGTH = 200;

/** Satır sonlarını tek boşluğa indirir ve kısaltır. */
export function excerpt(
  text: string | null | undefined,
  max = MAIL_NOTICE_EXCERPT_LENGTH,
): string {
  const flat = String(text ?? "")
    .replace(/\s+/g, " ")
    .trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

/** "1.234,50 TL" — e-posta şablonlarıyla aynı biçimleyici. */
export function formatNoticeAmount(
  amount: number | string | { valueOf(): unknown } | null | undefined,
): string {
  return `${formatEmailPrice(amount)} TL`;
}

/** Admin paneli sayfaları (apps/admin rotaları). */
export const MAIL_NOTICE_ADMIN_PATHS = {
  order: (orderId: string) => `/operations/orders/${orderId}`,
  orders: () => "/operations/orders",
  refundRequest: (id: string) => `/operations/refund-requests/${id}`,
  trade: (tradeId: string) => `/operations/trades/${tradeId}`,
  offer: (offerId: string) => `/operations/offers/${offerId}`,
  supportTicket: (ticketId: string) => `/messaging/support/${ticketId}`,
  guestMessages: () => "/messaging/support?tab=guest",
  report: (reportId: string) => `/accounts/reports/${reportId}`,
  product: (productId: string) => `/catalog/products/${productId}`,
  discounts: () => "/marketing/discounts",
  boostPurchase: (boostId: string) => `/marketing/boost-purchases/${boostId}`,
} as const;

const fact = (
  label: MailNoticeFact["label"],
  value: string | null | undefined,
): MailNoticeFact[] => (value ? [{ label, value }] : []);

/** İptal eden taraf — `CancellationActor` değerleri. */
export type MailNoticeActor = `${CancellationActor}`;

const ACTOR_KEYS: Record<MailNoticeActor, MessageKey> = {
  buyer: "server.mailRouting.internal.actors.buyer",
  seller: "server.mailRouting.internal.actors.seller",
  platform: "server.mailRouting.internal.actors.platform",
  system: "server.mailRouting.internal.actors.system",
};

// ── Sipariş ────────────────────────────────────────────────────────────────

export function orderPaidNotice(input: {
  /** Sepet numarası; teklif siparişinde (grup yok) sipariş numarası. */
  ref: string;
  buyerName?: string | null;
  total: number | string | { valueOf(): unknown };
  orders: Array<{
    id: string;
    orderNumber: string;
    productTitle?: string | null;
    amount: number | string | { valueOf(): unknown };
    sellerName?: string | null;
  }>;
}): MailInternalNoticePayload {
  const items: MailNoticeItem[] = input.orders.map((order) => ({
    ref: order.orderNumber,
    text: [
      excerpt(order.productTitle, 80),
      formatNoticeAmount(order.amount),
      order.sellerName?.trim(),
    ]
      .filter(Boolean)
      .join(" · "),
    adminPath: MAIL_NOTICE_ADMIN_PATHS.order(order.id),
  }));
  return {
    ref: input.ref,
    facts: [
      ...fact("buyer", input.buyerName?.trim()),
      { label: "total", value: formatNoticeAmount(input.total) },
      { label: "orderCount", value: String(input.orders.length) },
    ],
    adminPath:
      input.orders.length === 1
        ? MAIL_NOTICE_ADMIN_PATHS.order(input.orders[0].id)
        : MAIL_NOTICE_ADMIN_PATHS.orders(),
    items,
  };
}

export function orderCancelledNotice(input: {
  orderId: string;
  orderNumber: string;
  /** null = göç öncesi iptal, aktör bilinmiyor (olgu gösterilmez). */
  cancelledBy: MailNoticeActor | null;
  amount?: number | string | { valueOf(): unknown } | null;
  buyerName?: string | null;
  sellerName?: string | null;
  reason?: string | null;
}): MailInternalNoticePayload {
  return {
    ref: input.orderNumber,
    facts: [
      ...(input.cancelledBy
        ? [
            {
              label: "cancelledBy" as const,
              valueKey: ACTOR_KEYS[input.cancelledBy],
            },
          ]
        : []),
      ...fact("buyer", input.buyerName?.trim()),
      ...fact("seller", input.sellerName?.trim()),
      ...(input.amount != null
        ? [
            {
              label: "amount" as const,
              value: formatNoticeAmount(input.amount),
            },
          ]
        : []),
      ...fact("reason", excerpt(input.reason)),
    ],
    adminPath: MAIL_NOTICE_ADMIN_PATHS.order(input.orderId),
  };
}

export function refundRequestedNotice(input: {
  refundRequestId: string;
  refundNumber: string;
  orderNumber: string;
  amount?: number | string | { valueOf(): unknown } | null;
  reason?: string | null;
  requiresAdminReview: boolean;
}): MailInternalNoticePayload {
  return {
    ref: input.refundNumber,
    facts: [
      { label: "order", value: input.orderNumber },
      ...(input.amount != null
        ? [
            {
              label: "amount" as const,
              value: formatNoticeAmount(input.amount),
            },
          ]
        : []),
      ...fact("reason", excerpt(input.reason)),
      {
        label: "requiresReview",
        valueKey: input.requiresAdminReview
          ? "server.mailRouting.internal.yes"
          : "server.mailRouting.internal.no",
      },
    ],
    adminPath: MAIL_NOTICE_ADMIN_PATHS.refundRequest(input.refundRequestId),
  };
}

// ── Takas ──────────────────────────────────────────────────────────────────

export function tradeStartedNotice(input: {
  tradeId: string;
  tradeNumber: string;
  initiatorName?: string | null;
  receiverName?: string | null;
  cashAmount?: number | string | { valueOf(): unknown } | null;
  awaitingPayment: boolean;
}): MailInternalNoticePayload {
  const cash = Number(input.cashAmount ?? 0);
  return {
    ref: input.tradeNumber,
    facts: [
      ...fact("initiator", input.initiatorName?.trim()),
      ...fact("receiver", input.receiverName?.trim()),
      ...(cash > 0
        ? [{ label: "cashAmount" as const, value: formatNoticeAmount(cash) }]
        : []),
      {
        label: "status",
        valueKey: input.awaitingPayment
          ? "server.mailRouting.internal.tradeStatus.awaitingPayment"
          : "server.mailRouting.internal.tradeStatus.shippingToWarehouse",
      },
    ],
    adminPath: MAIL_NOTICE_ADMIN_PATHS.trade(input.tradeId),
  };
}

export function tradeDisputedNotice(input: {
  tradeId: string;
  tradeNumber: string;
  raisedByName?: string | null;
  reason?: string | null;
}): MailInternalNoticePayload {
  return {
    ref: input.tradeNumber,
    facts: [
      ...fact("raisedBy", input.raisedByName?.trim()),
      ...fact("reason", excerpt(input.reason)),
    ],
    adminPath: MAIL_NOTICE_ADMIN_PATHS.trade(input.tradeId),
  };
}

// ── Teklif ─────────────────────────────────────────────────────────────────

export function offerConvertedNotice(input: {
  offerId: string;
  orderNumber: string;
  buyerName?: string | null;
  sellerName?: string | null;
  productTitle?: string | null;
  amount: number | string | { valueOf(): unknown };
}): MailInternalNoticePayload {
  return {
    ref: input.orderNumber,
    facts: [
      ...fact("buyer", input.buyerName?.trim()),
      ...fact("seller", input.sellerName?.trim()),
      ...fact("product", excerpt(input.productTitle, 80)),
      { label: "amount", value: formatNoticeAmount(input.amount) },
    ],
    adminPath: MAIL_NOTICE_ADMIN_PATHS.offer(input.offerId),
  };
}

// ── Destek ─────────────────────────────────────────────────────────────────

export function supportTicketOpenedNotice(input: {
  ticketId: string;
  ticketNumber: string;
  userName?: string | null;
  category?: string | null;
  priority?: string | null;
  subject?: string | null;
}): MailInternalNoticePayload {
  return {
    ref: input.ticketNumber,
    facts: [
      ...fact("user", input.userName?.trim()),
      ...fact("category", input.category ?? undefined),
      ...fact("priority", input.priority ?? undefined),
      ...fact("subject", excerpt(input.subject, 120)),
    ],
    adminPath: MAIL_NOTICE_ADMIN_PATHS.supportTicket(input.ticketId),
  };
}

/**
 * Misafir iletişim mesajı. Mesajın tamamı panelde (Destek → Misafir
 * mesajları); e-postada kısa alıntı. "Yanıtla" misafire gider.
 */
export function guestMessageNotice(input: {
  referenceNumber: string;
  name: string;
  email: string;
  subject?: string | null;
  message: string;
}): MailInternalNoticePayload {
  // Başlığa girecek değerlerde satır sonu kalmaz (CRLF header injection).
  const email = String(input.email ?? "")
    .replace(/[\r\n]+/g, " ")
    .trim();
  return {
    ref: input.referenceNumber,
    facts: [
      ...fact("name", excerpt(input.name, 80)),
      ...fact("email", email),
      ...fact("subject", excerpt(input.subject, 120)),
      ...fact("message", excerpt(input.message)),
    ],
    adminPath: MAIL_NOTICE_ADMIN_PATHS.guestMessages(),
    ...(email ? { replyTo: email } : {}),
  };
}

// ── Şikayet / ilan / indirim / öne çıkarma ─────────────────────────────────

export function productReportedNotice(input: {
  reportId: string;
  productRef: string;
  reporterName?: string | null;
  reason: string;
  productTitle?: string | null;
}): MailInternalNoticePayload {
  return {
    ref: input.productRef,
    facts: [
      ...fact("product", excerpt(input.productTitle, 80)),
      ...fact("reporter", input.reporterName?.trim()),
      ...fact("reason", excerpt(input.reason)),
    ],
    adminPath: MAIL_NOTICE_ADMIN_PATHS.report(input.reportId),
  };
}

export function listingPendingApprovalNotice(input: {
  productId: string;
  productCode?: string | null;
  title: string;
  sellerName?: string | null;
  price?: number | string | { valueOf(): unknown } | null;
}): MailInternalNoticePayload {
  return {
    ref: input.productCode || input.productId,
    facts: [
      ...fact("product", excerpt(input.title, 80)),
      ...fact("seller", input.sellerName?.trim()),
      ...(input.price != null
        ? [{ label: "price" as const, value: formatNoticeAmount(input.price) }]
        : []),
    ],
    adminPath: MAIL_NOTICE_ADMIN_PATHS.product(input.productId),
  };
}

/** İndirimin değeri: yüzde "%10", tutar "50,00 TL", diğerleri türün adı. */
export function discountValueText(
  type: string,
  value: number | string | { valueOf(): unknown },
): string {
  if (type === "percentage") return `%${Number(value)}`;
  if (type === "fixed_amount") return formatNoticeAmount(value);
  return type;
}

export function sellerDiscountCreatedNotice(input: {
  discountRef: string;
  sellerName?: string | null;
  type: string;
  value: number | string | { valueOf(): unknown };
  productCount: number;
  startDate?: Date | null;
  endDate?: Date | null;
}): MailInternalNoticePayload {
  const validity =
    input.startDate && input.endDate
      ? `${formatEmailDate(input.startDate)} – ${formatEmailDate(input.endDate)}`
      : undefined;
  return {
    ref: input.discountRef,
    facts: [
      ...fact("seller", input.sellerName?.trim()),
      { label: "discount", value: discountValueText(input.type, input.value) },
      ...(input.productCount > 0
        ? [
            {
              label: "productCount" as const,
              value: String(input.productCount),
            },
          ]
        : []),
      ...fact("validity", validity),
    ],
    adminPath: MAIL_NOTICE_ADMIN_PATHS.discounts(),
  };
}

export function boostPurchasedNotice(input: {
  boostId: string;
  orderNumber: string;
  userName?: string | null;
  packageName?: string | null;
  durationDays: number;
  amount: number | string | { valueOf(): unknown };
  productTitle?: string | null;
}): MailInternalNoticePayload {
  return {
    ref: input.orderNumber,
    facts: [
      ...fact("user", input.userName?.trim()),
      ...fact("product", excerpt(input.productTitle, 80)),
      ...fact("package", input.packageName?.trim()),
      { label: "duration", value: String(input.durationDays) },
      { label: "amount", value: formatNoticeAmount(input.amount) },
    ],
    adminPath: MAIL_NOTICE_ADMIN_PATHS.boostPurchase(input.boostId),
  };
}
