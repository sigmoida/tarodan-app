/**
 * Sipariş / kargo / teklif durumlarının GERÇEK değerleri — Prisma şemasındaki
 * `OrderStatus`, `ShipmentStatus`, `OfferStatus` ve `OrderOrigin` enum'larıyla
 * birebir (küçük harf). API bunları Prisma tipleriyle eşleştiren bir contract
 * spec'le kilitler; şemaya bir değer eklenirse o spec kırılır.
 *
 * `order.ts` / `offer.ts` içindeki büyük harfli enum'lar bu değerlerle hiç
 * örtüşmedi ve eski istemciler için duruyor — yeni kod bunları kullanır.
 */

export const ORDER_STATUSES = [
  "pending_payment",
  "paid",
  "preparing",
  "shipped",
  "delivered",
  "awaiting_buyer_confirmation",
  "completed",
  "cancelled",
  "refund_requested",
  "refunded",
] as const;

export type OrderStatusValue = (typeof ORDER_STATUSES)[number];

export const SHIPMENT_STATUSES = [
  "pending",
  "label_created",
  "picked_up",
  "in_transit",
  "at_delivery_branch",
  "out_for_delivery",
  "delivered",
  "failed",
  "return_in_progress",
  "returned",
  "cancelled",
] as const;

export type ShipmentStatusValue = (typeof SHIPMENT_STATUSES)[number];

export const OFFER_STATUSES = [
  "pending",
  "accepted",
  "rejected",
  "expired",
  "cancelled",
  "payment_expired",
] as const;

export type OfferStatusValue = (typeof OFFER_STATUSES)[number];

export const ORDER_ORIGINS = [
  "direct_sale",
  "offer",
  "platform_service",
] as const;

export type OrderOriginValue = (typeof ORDER_ORIGINS)[number];

/**
 * Bir siparişi / takası KİMİN iptal ettiği — Prisma `CancellationActor` ile
 * birebir. Takasta teklifi açan taraf `buyer`, ilan sahibi `seller` sayılır;
 * `platform` yönetici kararı, `system` otomatik yoldur. Kolon null ise aktör
 * bilinmiyor (bu değer eklenmeden önceki iptaller).
 */
export const CANCELLATION_ACTORS = [
  "buyer",
  "seller",
  "platform",
  "system",
] as const;

export type CancellationActorValue = (typeof CANCELLATION_ACTORS)[number];

/**
 * İade talebi durumları — Prisma `RefundRequestStatus` ile birebir. Admin
 * İadeler ekranının kova kuralı (`admin-refund-list.ts`) bunları okur.
 */
export const REFUND_REQUEST_STATUSES = [
  "pending_review",
  "approved",
  "wait_for_delivery",
  "return_shipment_open",
  "return_in_transit",
  "return_delivered",
  "refunded",
  "rejected",
  "disputed",
  "cancelled",
] as const;

export type RefundRequestStatusValue = (typeof REFUND_REQUEST_STATUSES)[number];

/** Sağlayıcı iade denemesinin durumu — Prisma `RefundAttemptStatus` ile birebir. */
export const REFUND_ATTEMPT_STATUSES = [
  "prepared",
  "submitting",
  "succeeded",
  "finalized",
  "failed",
  "manual_review",
] as const;

export type RefundAttemptStatusValue = (typeof REFUND_ATTEMPT_STATUSES)[number];

/**
 * Takas durumları — Prisma `TradeStatus` ile birebir (`trade.ts` içindeki
 * büyük harfli enum eski istemciler içindir, şemayla örtüşmez).
 */
export const TRADE_STATUSES = [
  "pending",
  "accepted",
  "rejected",
  "initiator_shipped",
  "receiver_shipped",
  "both_shipped",
  "initiator_received",
  "receiver_received",
  "awaiting_payment",
  "shipping_to_warehouse",
  "at_warehouse",
  "admin_reviewing",
  "shipping_to_recipients",
  "returning",
  "completed",
  "cancelled",
  "disputed",
] as const;

export type TradeStatusValue = (typeof TRADE_STATUSES)[number];
