/** @format */

import { createTranslator } from "next-intl";
import { getMessages, resolveLocale } from "@tarodan/i18n";

export type OfferTab = "received" | "sent";

export interface Offer {
  id: string;
  amount: number;
  /** Satıcı karşı teklifinden sonra kabul/red sırası alıcıda. */
  buyerMustAccept?: boolean;
  status:
    "pending" | "accepted" | "rejected" | "countered" | "cancelled" | "expired";
  cancelReason?: string | null;
  orderId?: string | null;
  orderStatus?: string | null;
  message?: string;
  expiresAt: string;
  createdAt: string;
  product: {
    id: string;
    title: string;
    price: number;
    oldPrice?: number | null;
    originalPrice?: number | null;
    salePrice?: number | null;
    isOnSale?: boolean;
    imageUrl?: string;
    images?: { cardUrl?: string; detailUrl?: string; url?: string }[];
    categoryId?: string | null;
    /** Paket boyutu — net tahmin ürünün kendi kargo kademesiyle yapılır. */
    shippingPackageTier?: string | null;
  };
  buyer?: { id: string; displayName: string; avatarUrl?: string };
  seller?: { id: string; displayName: string; avatarUrl?: string };
}

const PAID_ORDER_STATUSES = [
  "paid",
  "preparing",
  "shipped",
  "delivered",
  "completed",
];

export const isOfferOrderPaid = (offer: Offer): boolean =>
  offer.status === "accepted" &&
  PAID_ORDER_STATUSES.includes(offer.orderStatus ?? "");

export const getOfferImage = (offer: Offer): string | undefined => {
  const img0 = offer.product.images?.[0];
  return (
    img0?.cardUrl ?? img0?.detailUrl ?? img0?.url ?? offer.product.imageUrl
  );
};

export const calculateDiscount = (
  offerAmount: number,
  listingPrice: number,
): number =>
  listingPrice > 0
    ? Math.round(((listingPrice - offerAmount) / listingPrice) * 100)
    : 0;

export function getTimeRemaining(expiresAt: string): string | null {
  const diff = new Date(expiresAt).getTime() - Date.now();
  if (diff <= 0) return null;
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  if (hours > 24) return `${Math.floor(hours / 24)} gün`;
  return `${hours}s ${minutes}d`;
}

export function formatTimeAgo(
  timestamp: string,
  locale: string = "tr",
): string {
  const t = createTranslator({
    locale,
    messages: getMessages(resolveLocale(locale)),
  });
  const diff = Date.now() - new Date(timestamp).getTime();
  if (diff < 0) return t("time.justNow");
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (minutes < 1) return t("time.justNow");
  if (minutes < 60) return t("time.ago.minutes", { count: minutes });
  if (hours < 24) return t("time.ago.hours", { count: hours });
  if (days < 30) return t("time.ago.days", { count: days });
  const months = Math.floor(days / 30);
  return t("time.ago.months", { count: months });
}

const OFFER_STATUS_EN: Record<string, string> = {
  pending: "Pending",
  accepted: "Accepted",
  rejected: "Rejected",
  countered: "Counter Offer",
  cancelled: "Cancelled",
  expired: "Expired",
  payment_expired: "Payment Expired",
};

/** Localized status label. `trFallback` comes from the shared offerStatusConfig. */
export const offerStatusLabel = (
  status: string,
  locale: string,
  trFallback: string,
): string => (locale === "en" ? OFFER_STATUS_EN[status] || status : trFallback);
