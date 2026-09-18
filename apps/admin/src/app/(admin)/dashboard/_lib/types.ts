import {
  DASHBOARD_METRIC_KEYS,
  type DashboardMetric,
  type DashboardMetricKey,
  type DashboardPeriodRange,
} from "@tarodan/types";
import { orderStatusConfig, tradeStatusConfig } from "@tarodan/shared";
import type { StatusConfig } from "@tarodan/ui";
import { useTranslations } from "next-intl";
import { fmtDate } from "@/lib/format";
import { statusConfig } from "@/lib/statusLabels";

type T = ReturnType<typeof useTranslations<never>>;

export type DashboardMetrics = Record<DashboardMetricKey, DashboardMetric>;

const EMPTY_METRIC: DashboardMetric = {
  period: 0,
  previous: 0,
  allTime: 0,
  changePercent: 0,
};

/**
 * Coerce the dashboard response into the metric map the cards read.
 *
 * The dashboard tolerates a failing/undeployed endpoint (see `useDashboard`),
 * so every metric falls back to zeros instead of blanking the screen.
 */
export function toDashboardMetrics(raw: unknown): DashboardMetrics {
  const source = (raw ?? {}) as Partial<Record<DashboardMetricKey, unknown>>;
  const metrics = {} as DashboardMetrics;

  for (const key of DASHBOARD_METRIC_KEYS) {
    const entry = source[key];
    metrics[key] =
      entry && typeof entry === "object"
        ? {
            period: Number((entry as DashboardMetric).period ?? 0),
            previous: Number((entry as DashboardMetric).previous ?? 0),
            allTime: Number((entry as DashboardMetric).allTime ?? 0),
            changePercent: Number(
              (entry as DashboardMetric).changePercent ?? 0,
            ),
          }
        : EMPTY_METRIC;
  }

  return metrics;
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
}

export interface DashboardData {
  metrics: DashboardMetrics;
  range: DashboardPeriodRange | null;
  recentOrders: RecentOrder[];
  recentTrades: RecentTrade[];
  pendingActions: PendingActions | null;
  analytics: DashboardAnalytics;
  topProducts: TopProduct[];
  topSellers: TopSeller[];
}

/**
 * Badge copy for the recent-orders / recent-trades lists.
 *
 * The shared maps carry catalog KEYS, not labels, so they have to be resolved
 * with the screen's translator — spreading them raw is what used to print the
 * bare enum value ("shipped", "cancelled") in the UI.
 */
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
