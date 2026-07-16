import { orderStatusConfig, tradeStatusConfig } from '@tarodan/ui';
import type { StatusConfig } from '@tarodan/ui';
import { useTranslations } from 'next-intl';

type T = ReturnType<typeof useTranslations<never>>;

export interface DashboardStats {
  totalUsers: number;
  usersChange: number;
  totalProducts: number;
  activeProducts: number;
  productsChange: number;
  totalOrders: number;
  ordersChange: number;
  totalRevenue: number;
  revenueChange: number;
  totalCommission: number;
  commissionChange: number;
  pendingApprovals: number;
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
  initiator?: { id: string; displayName?: string | null; email?: string | null };
  receiver?: { id: string; displayName?: string | null; email?: string | null };
  items?: Array<{ side: string; product?: { id: string; title?: string | null } }>;
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
  recentOrders: RecentOrder[];
  recentTrades: RecentTrade[];
  pendingActions: PendingActions | null;
  analytics: DashboardAnalytics;
}

/** Order config + refund_requested (not in the shared config). */
export function dashboardOrderStatusConfig(t: T): Record<string, StatusConfig> {
  return {
    ...orderStatusConfig,
    refund_requested: { label: t('admin.dashboard.status.refundRequested'), variant: 'warning' },
  };
}

/** Trade config + in_progress (not in the shared config). */
export function dashboardTradeStatusConfig(t: T): Record<string, StatusConfig> {
  return {
    ...tradeStatusConfig,
    in_progress: { label: t('admin.dashboard.status.inProgress'), variant: 'info' },
  };
}

export function formatRelativeDate(dateString: string, t: T) {
  const date = new Date(dateString);
  const diffMins = Math.floor((new Date().getTime() - date.getTime()) / 60000);
  if (diffMins < 60) return t('admin.dashboard.relativeTime.minutesAgo', { count: diffMins });
  if (diffMins < 1440)
    return t('admin.dashboard.relativeTime.hoursAgo', { count: Math.floor(diffMins / 60) });
  return date.toLocaleDateString('tr-TR');
}
