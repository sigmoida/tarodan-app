/** @format */

import { createTranslator } from "next-intl";
import { getMessages, resolveLocale } from "@tarodan/i18n";

const DATE_LOCALES = { en: "en-US", tr: "tr-TR" } as const;

export interface Notification {
  id: string;
  type: string;
  title: string;
  message: string;
  icon?: string;
  link?: string;
  isRead: boolean;
  createdAt: string;
  data?: Record<string, any>;
}

export type FilterType =
  "all" | "unread" | "orders" | "offers" | "trades" | "messages" | "other";

export const NOTIFICATION_CATEGORIES: Record<string, FilterType> = {
  order_created: "orders",
  order_paid: "orders",
  order_shipped: "orders",
  order_delivered: "orders",
  order_completed: "orders",
  order_cancelled: "orders",
  order_refunded: "orders",
  payment_received: "orders",
  payment_released: "orders",
  product_sold: "orders",
  offer_received: "offers",
  offer_accepted: "offers",
  offer_rejected: "offers",
  offer_counter: "offers",
  offer_expired: "offers",
  trade_received: "trades",
  trade_accepted: "trades",
  trade_rejected: "trades",
  trade_shipped: "trades",
  trade_completed: "trades",
  new_message: "messages",
};

export const FILTER_LABELS: Record<FilterType, { tr: string; en: string }> = {
  all: { tr: "Tümü", en: "All" },
  unread: { tr: "Okunmamış", en: "Unread" },
  orders: { tr: "Siparişler", en: "Orders" },
  offers: { tr: "Teklifler", en: "Offers" },
  trades: { tr: "Takaslar", en: "Trades" },
  messages: { tr: "Mesajlar", en: "Messages" },
  other: { tr: "Diğer", en: "Other" },
};

export const getNotificationCategory = (type: string): FilterType =>
  NOTIFICATION_CATEGORIES[type] || "other";

export function getTimeAgo(dateString: string, locale: string): string {
  const date = new Date(dateString);
  const diffMs = Date.now() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  const en = locale === "en";
  const t = createTranslator({
    locale,
    messages: getMessages(resolveLocale(locale)),
  });

  if (diffMins < 1) return t("time.justNow");
  if (diffMins < 60) return en ? `${diffMins}m ago` : `${diffMins} dk önce`;
  if (diffHours < 24) return en ? `${diffHours}h ago` : `${diffHours} sa önce`;
  if (diffDays < 7) return en ? `${diffDays}d ago` : `${diffDays} gün önce`;
  return date.toLocaleDateString(DATE_LOCALES[resolveLocale(locale)]);
}
