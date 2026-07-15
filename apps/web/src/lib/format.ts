import { createTranslator } from "next-intl";
import { getMessages, resolveLocale, type MessageKey } from "@tarodan/i18n";

/** A root translator for `locale`, backed by the shared message catalog. */
const translator = (locale: string) =>
  createTranslator({ locale, messages: getMessages(resolveLocale(locale)) });

// Cached Intl instances — built once and reused across every row (constructing an
// Intl formatter is the costly part; formatting with it is cheap). Replaces the
// per-render `new Date().toLocaleDateString()` / `toLocaleString()` churn in lists.
const tlNumberFmt = new Intl.NumberFormat("tr-TR", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const dateFmt = new Intl.DateTimeFormat("tr-TR");
const timeFmt = new Intl.DateTimeFormat("tr-TR", {
  hour: "2-digit",
  minute: "2-digit",
});
const dateTimeFmt = new Intl.DateTimeFormat("tr-TR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

type DateLike = string | number | Date | null | undefined;

/** Locale-default short date (dd.MM.yyyy) — matches `toLocaleDateString('tr-TR')`. */
export function formatDate(value: DateLike): string {
  if (value === null || value === undefined || value === "") return "";
  const d = value instanceof Date ? value : new Date(value);
  return isNaN(d.getTime()) ? "" : dateFmt.format(d);
}

/** Short time (HH:mm) — matches `toLocaleTimeString('tr-TR', { hour, minute })`. */
export function formatTime(value: DateLike): string {
  if (value === null || value === undefined || value === "") return "";
  const d = value instanceof Date ? value : new Date(value);
  return isNaN(d.getTime()) ? "" : timeFmt.format(d);
}

/** Short date + time (dd.MM.yyyy HH:mm). */
export function formatDateTime(value: DateLike): string {
  if (value === null || value === undefined || value === "") return "";
  const d = value instanceof Date ? value : new Date(value);
  return isNaN(d.getTime()) ? "" : dateTimeFmt.format(d);
}

/**
 * Format price as "12.30 TL" instead of "₺12.30" or "TRY 12.30"
 */
export function formatPrice(price: number | string | null | undefined): string {
  if (price === null || price === undefined) {
    return "0,00 TL";
  }

  const numPrice = typeof price === "string" ? parseFloat(price) : price;

  if (isNaN(numPrice)) {
    return "0,00 TL";
  }

  return `${tlNumberFmt.format(numPrice)} TL`;
}

/** Alias of {@link formatPrice} — "12,30 TL". The single money formatter used
 * across profile surfaces (my-listings, orders, offers, trades, …). */
export const formatTL = formatPrice;

/**
 * Format price without TL suffix (for cases where TL is added separately)
 */
export function formatPriceNumber(
  price: number | string | null | undefined,
): string {
  if (price === null || price === undefined) {
    return "0,00";
  }

  const numPrice = typeof price === "string" ? parseFloat(price) : price;

  if (isNaN(numPrice)) {
    return "0,00";
  }

  return numPrice.toLocaleString("tr-TR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/**
 * Sayaç formatı (görüntülenme/beğeni) — "1.590". Locale SABİT tr-TR:
 * locale'siz toLocaleString() server'da en-US ("1,590"), tarayıcıda kullanıcı
 * diliyle çalışıp hydration mismatch üretir.
 */
export function formatCount(value: number | null | undefined): string {
  return (value ?? 0).toLocaleString("tr-TR");
}

/**
 * Format product condition to Turkish
 * Converts: new, like_new, very_good, good, fair, poor
 */
export function formatCondition(
  condition: string | null | undefined,
  locale: string = "tr",
): string {
  if (!condition) return translator(locale)("common.unknown");

  // Filtre ve ürün kartında aynı etiketler kullanılsın (Yeni, Yeni Gibi, İyi, Orta)
  const conditionMap: Record<string, MessageKey> = {
    new: "product.conditionNew",
    like_new: "product.conditionLikeNew",
    very_good: "product.conditionVeryGood",
    good: "product.conditionGood",
    fair: "product.conditionFair",
    poor: "product.conditionPoor",
  };

  const normalized = condition.toLowerCase().trim();
  const mapped = conditionMap[normalized];

  if (mapped) {
    return translator(locale)(mapped);
  }

  // Fallback: capitalize and replace underscores
  return condition.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

/**
 * Format order status to Turkish
 * Converts: pending_payment, paid, preparing, shipped, delivered, completed, cancelled, refund_requested, refunded
 */
export function formatOrderStatus(
  status: string | null | undefined,
  locale: string = "tr",
): string {
  if (!status) return translator(locale)("common.unknown");

  const statusMap: Record<string, MessageKey> = {
    pending_payment: "order.statusPendingPayment",
    paid: "order.statusPaid",
    preparing: "order.statusProcessing",
    shipped: "order.statusShipped",
    in_transit: "order.shipStatusInTransit",
    out_for_delivery: "trade.shipmentStatus.out_for_delivery",
    delivered: "order.statusDelivered",
    completed: "order.statusCompleted",
    cancelled: "order.statusCancelled",
    refund_requested: "order.statusRefundRequested",
    refunded: "order.statusRefunded",
  };

  const normalized = status.toLowerCase().trim();
  const mapped = statusMap[normalized];

  if (mapped) {
    return translator(locale)(mapped);
  }

  // Fallback: capitalize and replace underscores
  return status.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

/**
 * Format product status to Turkish
 * Converts: pending, active, reserved, sold, inactive, rejected
 */
export function formatProductStatus(
  status: string | null | undefined,
  locale: string = "tr",
): string {
  if (!status) return translator(locale)("common.unknown");

  const statusMap: Record<string, MessageKey> = {
    pending: "product.statusPending",
    active: "product.statusActive",
    reserved: "product.statusReserved",
    sold: "product.statusSold",
    inactive: "product.statusInactive",
    rejected: "product.statusRejected",
    deleted: "product.statusDeleted",
  };

  const normalized = status.toLowerCase().trim();
  const mapped = statusMap[normalized];

  if (mapped) {
    return translator(locale)(mapped);
  }

  // Fallback: capitalize and replace underscores
  return status.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

/**
 * Format shipment status to Turkish
 * Converts: pending, label_created, picked_up, in_transit, out_for_delivery, delivered, returned, failed
 */
export function formatShipmentStatus(
  status: string | null | undefined,
  locale: string = "tr",
): string {
  if (!status) return translator(locale)("common.unknown");

  const statusMap: Record<string, MessageKey> = {
    pending: "order.statusPending",
    label_created: "order.shipStatusLabelCreated",
    picked_up: "trade.shipmentStatus.picked_up",
    in_transit: "order.shipStatusInTransit",
    out_for_delivery: "trade.shipmentStatus.out_for_delivery",
    delivered: "order.statusDelivered",
    returned: "trade.shipmentStatus.returned",
    failed: "trade.shipmentStatus.failed",
  };

  const normalized = status.toLowerCase().trim();
  const mapped = statusMap[normalized];

  if (mapped) {
    return translator(locale)(mapped);
  }

  // Fallback: capitalize and replace underscores
  return status.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

/**
 * Format trade status to Turkish
 * Converts: pending, accepted, rejected, cancelled, completed
 */
export function formatTradeStatus(
  status: string | null | undefined,
  locale: string = "tr",
): string {
  if (!status) return translator(locale)("common.unknown");

  const statusMap: Record<string, MessageKey> = {
    pending: "trade.statusPending",
    accepted: "trade.statusAccepted",
    rejected: "trade.statusRejected",
    cancelled: "trade.statusCancelled",
    completed: "trade.statusCompleted",
    in_progress: "trade.statusInProgress",
    shipping: "trade.statusShipping",
    awaiting_confirmation: "trade.statusAwaitingConfirmation",
    initiator_shipped: "trade.statusInitiatorShipped",
    receiver_shipped: "trade.statusReceiverShipped",
    both_shipped: "trade.statusBothShipped",
    initiator_received: "trade.statusInitiatorReceived",
    receiver_received: "trade.statusReceiverReceived",
    // Escrow / güvenli takas statüleri
    awaiting_payment: "trade.statusAwaitingPayment",
    shipping_to_warehouse: "trade.statusShippingToWarehouse",
    at_warehouse: "trade.statusAtWarehouse",
    admin_reviewing: "trade.statusAdminReviewing",
    shipping_to_recipients: "trade.statusShippingToRecipients",
    returning: "trade.statusReturning",
    disputed: "trade.statusDisputed",
  };

  const normalized = status.toLowerCase().trim();
  const mapped = statusMap[normalized];

  if (mapped) {
    return translator(locale)(mapped);
  }

  // Fallback: capitalize and replace underscores
  return status.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

/**
 * Format offer status to Turkish
 * Converts: pending, accepted, rejected, expired, cancelled, counter_offered
 */
export function formatOfferStatus(
  status: string | null | undefined,
  locale: string = "tr",
): string {
  if (!status) return translator(locale)("common.unknown");

  const statusMap: Record<string, MessageKey> = {
    pending: "trade.statusPending",
    accepted: "trade.statusAccepted",
    rejected: "trade.statusRejected",
    expired: "offer.statusExpired",
    cancelled: "trade.statusCancelled",
    counter_offered: "offer.statusCounterOffered",
  };

  const normalized = status.toLowerCase().trim();
  const mapped = statusMap[normalized];

  if (mapped) {
    return translator(locale)(mapped);
  }

  // Fallback: capitalize and replace underscores
  return status.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}
