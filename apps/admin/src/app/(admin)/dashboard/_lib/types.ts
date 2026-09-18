import { orderStatusConfig, tradeStatusConfig } from "@tarodan/shared";
import type { StatusConfig } from "@tarodan/ui";
import { useTranslations } from "next-intl";
import { fmtDate } from "@/lib/format";
import { statusConfig } from "@/lib/statusLabels";


type T = ReturnType<typeof useTranslations<never>>;

export interface TopProduct {
  id: string;
  title: string;
  thumbnail?: string | null;
  viewCount: number;
  sellerId: string;
  sellerName: string;
  status: string;
  price: number;
}

export interface TopSeller {
  id: string;
  displayName: string;
  avatarUrl?: string | null;
  storeViewCount: number;
  productCount: number;
  activeListings: number;
}

export interface RecentOrder {
  id: string;
  orderNumber: string;
  buyerName: string;
  productTitle: string;
  amount: number;
  status: string;
  createdAt: string;
}

export interface RecentTrade {
  id: string;
  status: string;
  createdAt: string;
  initiator?: {
    id: string;
    displayName?: string | null;
    email?: string | null;
  };
  receiver?: { id: string; displayName?: string | null; email?: string | null };
  items?: Array<{
    side: string;
    product?: { id: string; title?: string | null };
  }>;
}

export function dashboardOrderStatusConfig(t: T): Record<string, StatusConfig> {
  return statusConfig(orderStatusConfig, t);
}

export function dashboardTradeStatusConfig(t: T): Record<string, StatusConfig> {
  return statusConfig(tradeStatusConfig, t);
}

export function formatRelativeDate(dateString: string, t: T) {
  const date = new Date(dateString);
  const diffMins = Math.floor((new Date().getTime() - date.getTime()) / 60000);
  if (diffMins < 60)
    return t("admin.dashboard.relativeTime.minutesAgo", { count: diffMins });
  if (diffMins < 1440)
    return t("admin.dashboard.relativeTime.hoursAgo", {
      count: Math.floor(diffMins / 60),
    });
  return fmtDate(date) ?? dateString;
}
