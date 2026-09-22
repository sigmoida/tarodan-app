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
