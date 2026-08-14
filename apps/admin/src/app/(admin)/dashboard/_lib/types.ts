import { orderStatusConfig, tradeStatusConfig } from "@tarodan/ui";
import type { StatusConfig } from "@tarodan/ui";
import { useTranslations } from "next-intl";
import { fmtDate } from "@/lib/format";

type T = ReturnType<typeof useTranslations<never>>;

/**
 * Yesterday / this-month / last-month + changePercent breakdown for a single
 * metric. Mirrors the `MetricPeriods` interface returned by the API dashboard
 * endpoint (#295).
 */
export interface MetricPeriods {
  yesterday: number;
  thisMonth: number;
  lastMonth: number;
  changePercent: number;
}

export const EMPTY_PERIODS: MetricPeriods = {
  yesterday: 0,
  thisMonth: 0,
  lastMonth: 0,
  changePercent: 0,
};

export interface DashboardStats {
  // Row 1
  totalOrders: number;
  totalOrdersPeriods: MetricPeriods;
  netCommissionTotal: number;
  netCommissionPeriods: MetricPeriods;
  activeProducts: number;
  passiveProducts: number;
  activeProductsPeriods: MetricPeriods;
  passiveProductsPeriods: MetricPeriods;
  activeUsers: number;
  passiveUsers: number;
  activeUsersPeriods: MetricPeriods;
  passiveUsersPeriods: MetricPeriods;

  // Row 2
  grossSales: number;
  grossSalesPeriods: MetricPeriods;
  netCommissionRow2: MetricPeriods;
  cancellations: number;
  refunds: number;
  cancellationsPeriods: MetricPeriods;
  refundsPeriods: MetricPeriods;

  pendingApprovals: number;
}

export interface VisitorStats {
  liveVisitors: number;
  dailyActiveVisitors: number;
}

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

export interface PendingActions {
  pendingProducts: number;
  refundRequests: number;
  pendingMessages?: number;
  identityVerificationRequests?: number;
  totalPending: number;
}

export interface DashboardAnalytics {
  salesByDay: number[];
  ordersByDay: number[];
  categoryDistribution: { name: string; count: number }[];
}

export interface DashboardData {
  stats: DashboardStats;
  visitors: VisitorStats;
  recentOrders: RecentOrder[];
  recentTrades: RecentTrade[];
  pendingActions: PendingActions | null;
  analytics: DashboardAnalytics;
  topProducts: TopProduct[];
  topSellers: TopSeller[];
}

/** Order config + refund_requested (not in the shared config). */
export function dashboardOrderStatusConfig(t: T): Record<string, StatusConfig> {
  return {
    ...orderStatusConfig,
    refund_requested: {
      label: t("admin.dashboard.status.refundRequested"),
      variant: "warning",
    },
  };
}

/** Trade config + in_progress (not in the shared config). */
export function dashboardTradeStatusConfig(t: T): Record<string, StatusConfig> {
  return {
    ...tradeStatusConfig,
    in_progress: {
      label: t("admin.dashboard.status.inProgress"),
      variant: "info",
    },
  };
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
