import type { MessageKey } from "@tarodan/i18n";

import type { StatusVariant } from "./status-variant";

/** Ekrana basılacak, dili çözülmüş durum etiketi. */
export interface StatusConfig {
  label: string;
  variant: StatusVariant;
}

/**
 * Ham durum tanımı: etiket YERİNE katalog anahtarı taşır.
 *
 * Etiketler bu pakette sabit metin olarak duramaz — web ve admin aynı haritayı
 * kullanıyor ve metni ekrana basan taraf onlar. Paket i18n kütüphanesinden
 * bağımsız kalsın diye burada yalnız ANAHTAR tutulur; çözüm
 * {@link resolveStatusConfig} ile, uygulamanın kendi çeviricisiyle yapılır.
 */
export interface StatusConfigDef {
  labelKey: MessageKey;
  variant: StatusVariant;
}

export type StatusConfigDefMap = Record<string, StatusConfigDef>;

/** Ham tanımı, verilen çeviriciyle ekrana basılabilir etiketlere çözer. */
export function resolveStatusConfig(
  def: StatusConfigDefMap,
  translate: (key: MessageKey) => string,
): Record<string, StatusConfig> {
  const resolved: Record<string, StatusConfig> = {};
  for (const [value, entry] of Object.entries(def)) {
    resolved[value] = {
      label: translate(entry.labelKey),
      variant: entry.variant,
    };
  }
  return resolved;
}

/**
 * Order status → Badge mapping
 * Used in: orders page, order detail, track-order, dashboard
 */
export const orderStatusConfig: StatusConfigDefMap = {
  pending_payment: {
    labelKey: "status.order.pending_payment",
    variant: "warning",
  },
  paid: {
    labelKey: "status.order.paid",
    variant: "success",
  },
  preparing: {
    labelKey: "status.order.preparing",
    variant: "info",
  },
  shipped: {
    labelKey: "status.order.shipped",
    variant: "info",
  },
  delivered: {
    labelKey: "status.order.delivered",
    variant: "success",
  },
  awaiting_buyer_confirmation: {
    labelKey: "status.order.awaiting_buyer_confirmation",
    variant: "warning",
  },
  completed: {
    labelKey: "status.order.completed",
    variant: "success",
  },
  cancelled: {
    labelKey: "status.order.cancelled",
    variant: "danger",
  },
  refund_requested: {
    labelKey: "status.order.refund_requested",
    variant: "warning",
  },
  refunded: {
    labelKey: "status.order.refunded",
    variant: "secondary",
  },
};

/**
 * Trade status → Badge mapping
 * Used in: trades page, trade detail, dashboard
 */
export const tradeStatusConfig: StatusConfigDefMap = {
  pending: {
    labelKey: "status.trade.pending",
    variant: "warning",
  },
  accepted: {
    labelKey: "status.trade.accepted",
    variant: "success",
  },
  rejected: {
    labelKey: "status.trade.rejected",
    variant: "danger",
  },
  awaiting_payment: {
    labelKey: "status.trade.awaiting_payment",
    variant: "warning",
  },
  shipping_to_warehouse: {
    labelKey: "status.trade.shipping_to_warehouse",
    variant: "info",
  },
  at_warehouse: {
    labelKey: "status.trade.at_warehouse",
    variant: "info",
  },
  admin_reviewing: {
    labelKey: "status.trade.admin_reviewing",
    variant: "info",
  },
  shipping_to_recipients: {
    labelKey: "status.trade.shipping_to_recipients",
    variant: "info",
  },
  returning: {
    labelKey: "status.trade.returning",
    variant: "warning",
  },
  initiator_shipped: {
    labelKey: "status.trade.initiator_shipped",
    variant: "info",
  },
  receiver_shipped: {
    labelKey: "status.trade.receiver_shipped",
    variant: "info",
  },
  both_shipped: {
    labelKey: "status.trade.both_shipped",
    variant: "info",
  },
  initiator_received: {
    labelKey: "status.trade.initiator_received",
    variant: "info",
  },
  receiver_received: {
    labelKey: "status.trade.receiver_received",
    variant: "info",
  },
  completed: {
    labelKey: "status.trade.completed",
    variant: "success",
  },
  cancelled: {
    labelKey: "status.trade.cancelled",
    variant: "danger",
  },
  disputed: {
    labelKey: "status.trade.disputed",
    variant: "destructive",
  },
};

/**
 * RefundRequest status → Badge mapping
 * Used in: admin refund-requests page, mobile order detail refund banner
 */
export const refundRequestStatusConfig: StatusConfigDefMap = {
  pending_review: {
    labelKey: "status.refundRequest.pending_review",
    variant: "warning",
  },
  approved: {
    labelKey: "status.refundRequest.approved",
    variant: "success",
  },
  wait_for_delivery: {
    labelKey: "status.refundRequest.wait_for_delivery",
    variant: "info",
  },
  return_shipment_open: {
    labelKey: "status.refundRequest.return_shipment_open",
    variant: "info",
  },
  return_in_transit: {
    labelKey: "status.refundRequest.return_in_transit",
    variant: "info",
  },
  return_delivered: {
    labelKey: "status.refundRequest.return_delivered",
    variant: "info",
  },
  refunded: {
    labelKey: "status.refundRequest.refunded",
    variant: "success",
  },
  rejected: {
    labelKey: "status.refundRequest.rejected",
    variant: "danger",
  },
  disputed: {
    labelKey: "status.refundRequest.disputed",
    variant: "destructive",
  },
  cancelled: {
    labelKey: "status.refundRequest.cancelled",
    variant: "secondary",
  },
};

/**
 * Offer status → Badge mapping
 * Used in: offers page
 */
export const offerStatusConfig: StatusConfigDefMap = {
  pending: {
    labelKey: "status.offer.pending",
    variant: "warning",
  },
  accepted: {
    labelKey: "status.offer.accepted",
    variant: "success",
  },
  rejected: {
    labelKey: "status.offer.rejected",
    variant: "danger",
  },
  countered: {
    labelKey: "status.offer.countered",
    variant: "info",
  },
  expired: {
    labelKey: "status.offer.expired",
    variant: "secondary",
  },
  cancelled: {
    labelKey: "status.offer.cancelled",
    variant: "danger",
  },
  payment_expired: {
    labelKey: "status.offer.payment_expired",
    variant: "warning",
  },
};

/**
 * Payment status → Badge mapping
 * Used in: payments page, payment detail
 */
export const paymentStatusConfig: StatusConfigDefMap = {
  pending: {
    labelKey: "status.payment.pending",
    variant: "warning",
  },
  processing: {
    labelKey: "status.payment.processing",
    variant: "info",
  },
  completed: {
    labelKey: "status.payment.completed",
    variant: "success",
  },
  failed: {
    labelKey: "status.payment.failed",
    variant: "danger",
  },
  refunded: {
    labelKey: "status.payment.refunded",
    variant: "secondary",
  },
};

/**
 * Product status → Badge mapping
 * Used in: admin products, profile listings
 */
export const productStatusConfig: StatusConfigDefMap = {
  pending: {
    labelKey: "status.product.pending",
    variant: "warning",
  },
  active: {
    labelKey: "status.product.active",
    variant: "success",
  },
  inactive: {
    labelKey: "status.product.inactive",
    variant: "secondary",
  },
  sold: {
    labelKey: "status.product.sold",
    variant: "info",
  },
  reserved: {
    labelKey: "status.product.reserved",
    variant: "info",
  },
  rejected: {
    labelKey: "status.product.rejected",
    variant: "danger",
  },
  deleted: {
    labelKey: "status.product.deleted",
    variant: "danger",
  },
};

/**
 * Product condition → label/Badge mapping (ProductCondition enum).
 * Şema değerleri: new, like_new, very_good, good, fair.
 */
export const productConditionConfig: StatusConfigDefMap = {
  new: {
    labelKey: "status.productCondition.new",
    variant: "success",
  },
  like_new: {
    labelKey: "status.productCondition.like_new",
    variant: "info",
  },
  very_good: {
    labelKey: "status.productCondition.very_good",
    variant: "info",
  },
  good: {
    labelKey: "status.productCondition.good",
    variant: "default",
  },
  fair: {
    labelKey: "status.productCondition.fair",
    variant: "warning",
  },
};

/**
 * Admin role → label/Badge mapping (AdminRole enum).
 */
export const adminRoleConfig: StatusConfigDefMap = {
  super_admin: {
    labelKey: "status.adminRole.super_admin",
    variant: "danger",
  },
  admin: {
    labelKey: "status.adminRole.admin",
    variant: "primary",
  },
  moderator: {
    labelKey: "status.adminRole.moderator",
    variant: "info",
  },
};

/**
 * Support ticket status → label/Badge mapping (TicketStatus enum).
 */
export const ticketStatusConfig: StatusConfigDefMap = {
  open: {
    labelKey: "status.ticket.open",
    variant: "warning",
  },
  in_progress: {
    labelKey: "status.ticket.in_progress",
    variant: "info",
  },
  waiting_customer: {
    labelKey: "status.ticket.waiting_customer",
    variant: "warning",
  },
  resolved: {
    labelKey: "status.ticket.resolved",
    variant: "success",
  },
  closed: {
    labelKey: "status.ticket.closed",
    variant: "secondary",
  },
};

/**
 * Tax rule scope → label mapping (TaxRuleScope enum).
 */
export const taxScopeConfig: StatusConfigDefMap = {
  default_rate: {
    labelKey: "status.taxScope.default_rate",
    variant: "default",
  },
  category: {
    labelKey: "status.taxScope.category",
    variant: "info",
  },
  product: {
    labelKey: "status.taxScope.product",
    variant: "secondary",
  },
};

/** Üyelik paketi (MembershipTierType: free/basic/premium/business). */
export const membershipTierConfig: StatusConfigDefMap = {
  free: {
    labelKey: "status.membershipTier.free",
    variant: "secondary",
  },
  basic: {
    labelKey: "status.membershipTier.basic",
    variant: "info",
  },
  premium: {
    labelKey: "status.membershipTier.premium",
    variant: "warning",
  },
  business: {
    labelKey: "status.membershipTier.business",
    variant: "primary",
  },
};

/**
 * İade nedeni (RefundReason) — Prisma enum'unun 11 değerinin TAMAMI.
 * Buradaki anahtar listesi tek doğru kaynaktır; web/admin seçenek listeleri
 * buradan türetilir, elle kopyalanmaz (kopyalar sessizce kayıyordu: alıcıların
 * seçebildiği delivery_delayed/defective/buyer_damaged admin tablolarında ham
 * snake_case görünüyordu).
 */
export const refundReasonConfig: StatusConfigDefMap = {
  delivery_delayed: {
    labelKey: "status.refundReason.delivery_delayed",
    variant: "warning",
  },
  changed_mind: {
    labelKey: "status.refundReason.changed_mind",
    variant: "secondary",
  },
  damaged: {
    labelKey: "status.refundReason.damaged",
    variant: "danger",
  },
  wrong_item: {
    labelKey: "status.refundReason.wrong_item",
    variant: "warning",
  },
  not_as_described: {
    labelKey: "status.refundReason.not_as_described",
    variant: "warning",
  },
  missing_parts: {
    labelKey: "status.refundReason.missing_parts",
    variant: "warning",
  },
  counterfeit: {
    labelKey: "status.refundReason.counterfeit",
    variant: "danger",
  },
  defective: {
    labelKey: "status.refundReason.defective",
    variant: "danger",
  },
  buyer_damaged: {
    labelKey: "status.refundReason.buyer_damaged",
    variant: "warning",
  },
  lost_in_transit: {
    labelKey: "status.refundReason.lost_in_transit",
    variant: "danger",
  },
  other: {
    labelKey: "status.refundReason.other",
    variant: "default",
  },
};

/**
 * Alıcının iade formunda SEÇEBİLECEĞİ nedenler. `lost_in_transit` operasyonel
 * bir tespittir (kargo takibinden gelir), `other` ise politika çözümü olmayan
 * serbest kova olduğu için bilinçli olarak alıcıya sunulmaz.
 */
export const BUYER_SELECTABLE_REFUND_REASONS = Object.keys(
  refundReasonConfig,
).filter((reason) => reason !== "lost_in_transit" && reason !== "other");

/** Sipariş iptal nedeni (OrderCancellationReason) — enum'un 7 değerinin tamamı. */
export const orderCancellationReasonConfig: StatusConfigDefMap = {
  delivery_delayed: {
    labelKey: "status.orderCancellationReason.delivery_delayed",
    variant: "warning",
  },
  wrong_product_selected: {
    labelKey: "status.orderCancellationReason.wrong_product_selected",
    variant: "secondary",
  },
  changed_mind: {
    labelKey: "status.orderCancellationReason.changed_mind",
    variant: "secondary",
  },
  wrong_card: {
    labelKey: "status.orderCancellationReason.wrong_card",
    variant: "secondary",
  },
  price_changed_mind: {
    labelKey: "status.orderCancellationReason.price_changed_mind",
    variant: "secondary",
  },
  unavailable_at_address: {
    labelKey: "status.orderCancellationReason.unavailable_at_address",
    variant: "secondary",
  },
  other: {
    labelKey: "status.orderCancellationReason.other",
    variant: "default",
  },
};

/**
 * Alıcının iptal formunda SEÇEBİLECEĞİ nedenler. `other` politika çözümü
 * olmadığı için (backend'de manuel incelemeye düşürür, anında iptali bozar)
 * bilinçli olarak alıcıya sunulmaz.
 */
export const BUYER_SELECTABLE_CANCELLATION_REASONS = Object.keys(
  orderCancellationReasonConfig,
).filter((reason) => reason !== "other");

/** Kargo/gönderi durumu (ShipmentStatus). */
export const shipmentStatusConfig: StatusConfigDefMap = {
  pending: {
    labelKey: "status.shipment.pending",
    variant: "warning",
  },
  label_created: {
    labelKey: "status.shipment.label_created",
    variant: "info",
  },
  picked_up: {
    labelKey: "status.shipment.picked_up",
    variant: "info",
  },
  in_transit: {
    labelKey: "status.shipment.in_transit",
    variant: "info",
  },
  at_delivery_branch: {
    labelKey: "status.shipment.at_delivery_branch",
    variant: "info",
  },
  out_for_delivery: {
    labelKey: "status.shipment.out_for_delivery",
    variant: "info",
  },
  delivered: {
    labelKey: "status.shipment.delivered",
    variant: "success",
  },
  failed: {
    labelKey: "status.shipment.failed",
    variant: "danger",
  },
  return_in_progress: {
    labelKey: "status.shipment.return_in_progress",
    variant: "warning",
  },
  returned: {
    labelKey: "status.shipment.returned",
    variant: "secondary",
  },
  cancelled: {
    labelKey: "status.shipment.cancelled",
    variant: "danger",
  },
};

/** Bildirim kanalı (push/email/sms/in_app). */
export const notificationChannelConfig: StatusConfigDefMap = {
  push: {
    labelKey: "status.notificationChannel.push",
    variant: "info",
  },
  email: {
    labelKey: "status.notificationChannel.email",
    variant: "info",
  },
  sms: {
    labelKey: "status.notificationChannel.sms",
    variant: "info",
  },
  in_app: {
    labelKey: "status.notificationChannel.in_app",
    variant: "info",
  },
};

/** Bildirim/gönderim teslim durumu. */
export const deliveryStatusConfig: StatusConfigDefMap = {
  pending: {
    labelKey: "status.delivery.pending",
    variant: "warning",
  },
  scheduled: {
    labelKey: "status.delivery.scheduled",
    variant: "info",
  },
  sent: {
    labelKey: "status.delivery.sent",
    variant: "info",
  },
  delivered: {
    labelKey: "status.delivery.delivered",
    variant: "success",
  },
  failed: {
    labelKey: "status.delivery.failed",
    variant: "danger",
  },
  cancelled: {
    labelKey: "status.delivery.cancelled",
    variant: "secondary",
  },
};

/** Destek talebi kategorisi (TicketCategory). */
export const ticketCategoryConfig: StatusConfigDefMap = {
  payment: {
    labelKey: "status.ticketCategory.payment",
    variant: "info",
  },
  shipping: {
    labelKey: "status.ticketCategory.shipping",
    variant: "info",
  },
  trade: {
    labelKey: "status.ticketCategory.trade",
    variant: "info",
  },
  account: {
    labelKey: "status.ticketCategory.account",
    variant: "info",
  },
  product: {
    labelKey: "status.ticketCategory.product",
    variant: "info",
  },
  technical: {
    labelKey: "status.ticketCategory.technical",
    variant: "info",
  },
  other: {
    labelKey: "status.ticketCategory.other",
    variant: "default",
  },
};

/** Destek talebi önceliği (TicketPriority). */
export const ticketPriorityConfig: StatusConfigDefMap = {
  low: {
    labelKey: "status.ticketPriority.low",
    variant: "secondary",
  },
  medium: {
    labelKey: "status.ticketPriority.medium",
    variant: "info",
  },
  high: {
    labelKey: "status.ticketPriority.high",
    variant: "warning",
  },
  urgent: {
    labelKey: "status.ticketPriority.urgent",
    variant: "danger",
  },
};

/** Satıcı/başvuru tipi (SellerType). */
export const sellerTypeConfig: StatusConfigDefMap = {
  individual: {
    labelKey: "status.sellerType.individual",
    variant: "info",
  },
  verified: {
    labelKey: "status.sellerType.verified",
    variant: "success",
  },
  platform: {
    labelKey: "status.sellerType.platform",
    variant: "primary",
  },
};

/** Ödeme bekletme (escrow) durumu (PaymentHoldStatus). */
export const paymentHoldStatusConfig: StatusConfigDefMap = {
  held: {
    labelKey: "status.paymentHold.held",
    variant: "warning",
  },
  released: {
    labelKey: "status.paymentHold.released",
    variant: "success",
  },
  cancelled: {
    labelKey: "status.paymentHold.cancelled",
    variant: "danger",
  },
};

/** Satıcı ödeme aktarımı durumu (PayoutStatus). */
export const payoutStatusConfig: StatusConfigDefMap = {
  pending: {
    labelKey: "status.payout.pending",
    variant: "warning",
  },
  processing: {
    labelKey: "status.payout.processing",
    variant: "info",
  },
  completed: {
    labelKey: "status.payout.completed",
    variant: "success",
  },
  failed: {
    labelKey: "status.payout.failed",
    variant: "danger",
  },
  returned: {
    labelKey: "status.payout.returned",
    variant: "secondary",
  },
  retry_pending: {
    labelKey: "status.payout.retry_pending",
    variant: "warning",
  },
};

/** Üyelik abonelik durumu (SubscriptionStatus). */
export const subscriptionStatusConfig: StatusConfigDefMap = {
  active: {
    labelKey: "status.subscription.active",
    variant: "success",
  },
  trialing: {
    labelKey: "status.subscription.trialing",
    variant: "info",
  },
  cancelled: {
    labelKey: "status.subscription.cancelled",
    variant: "secondary",
  },
  expired: {
    labelKey: "status.subscription.expired",
    variant: "danger",
  },
  past_due: {
    labelKey: "status.subscription.past_due",
    variant: "warning",
  },
};

/** İndirim tipi (DiscountType). */
export const discountTypeConfig: StatusConfigDefMap = {
  percentage: {
    labelKey: "status.discountType.percentage",
    variant: "info",
  },
  fixed_amount: {
    labelKey: "status.discountType.fixed_amount",
    variant: "info",
  },
  bogo: {
    labelKey: "status.discountType.bogo",
    variant: "info",
  },
  bulk_quantity: {
    labelKey: "status.discountType.bulk_quantity",
    variant: "info",
  },
};

/** İndirim kapsamı (DiscountScope). */
export const discountScopeConfig: StatusConfigDefMap = {
  global: {
    labelKey: "status.discountScope.global",
    variant: "primary",
  },
  category: {
    labelKey: "status.discountScope.category",
    variant: "info",
  },
  product: {
    labelKey: "status.discountScope.product",
    variant: "secondary",
  },
  seller: {
    labelKey: "status.discountScope.seller",
    variant: "info",
  },
};

/** Mesaj durumu (MessageStatus). */
export const messageStatusConfig: StatusConfigDefMap = {
  sent: {
    labelKey: "status.messageStatus.sent",
    variant: "success",
  },
  pending_approval: {
    labelKey: "status.messageStatus.pending_approval",
    variant: "warning",
  },
  approved: {
    labelKey: "status.messageStatus.approved",
    variant: "success",
  },
  rejected: {
    labelKey: "status.messageStatus.rejected",
    variant: "danger",
  },
};

/** Log önem derecesi (severity). */
export const severityConfig: StatusConfigDefMap = {
  critical: {
    labelKey: "status.severity.critical",
    variant: "destructive",
  },
  error: {
    labelKey: "status.severity.error",
    variant: "danger",
  },
  warning: {
    labelKey: "status.severity.warning",
    variant: "warning",
  },
  info: {
    labelKey: "status.severity.info",
    variant: "info",
  },
  debug: {
    labelKey: "status.severity.debug",
    variant: "secondary",
  },
};

/** Ödeme sağlayıcı (markalı; sadece okunur biçim). */
export const paymentProviderConfig: StatusConfigDefMap = {
  paytr: {
    labelKey: "status.paymentProvider.paytr",
    variant: "default",
  },
  iyzico: {
    labelKey: "status.paymentProvider.iyzico",
    variant: "default",
  },
  stripe: {
    labelKey: "status.paymentProvider.stripe",
    variant: "default",
  },
  manual: {
    labelKey: "status.paymentProvider.manual",
    variant: "secondary",
  },
};

/** Kargo sağlayıcı (markalı; sadece okunur biçim). */
export const shipmentProviderConfig: StatusConfigDefMap = {
  surat: {
    labelKey: "status.shipmentProvider.surat",
    variant: "default",
  },
};

/**
 * Bir enum config'inden ham değeri okunabilir etikete çevir.
 * Eşleşme yoksa fallback (verilmezse ham değer / '—') döner.
 */
export function enumLabel(
  config: Record<string, StatusConfig>,
  value?: string | null,
  fallback?: string,
): string {
  if (!value) return fallback ?? "—";
  return config[value]?.label ?? fallback ?? value;
}
