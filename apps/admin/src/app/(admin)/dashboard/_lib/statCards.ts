import {
  ArrowTrendingUpIcon,
  BanknotesIcon,
  ChartBarIcon,
  CurrencyDollarIcon,
  ReceiptRefundIcon,
  ShoppingBagIcon,
  UserGroupIcon,
  UsersIcon,
} from "@heroicons/react/24/outline";
import type { ComponentType } from "react";
import type { DashboardMetricKey } from "@tarodan/types";
import type { MessageKey } from "@tarodan/i18n";
import type { MetricTone } from "@/components/MetricCard";

/**
 * One stat card: which metric(s) it shows and how they are formatted.
 *
 * The grid renders this list — a card is a row here, not another copy-pasted
 * block of JSX, so adding or reordering cards stays a one-line change.
 */
export interface StatCardConfig {
  id: string;
  labelKey: MessageKey;
  icon: ComponentType<{ className?: string }>;
  tone: MetricTone;
  format: "count" | "currency";
  /** The headline metric; its trend drives the card's change row. */
  metric: DashboardMetricKey;
  /** Hides the trend row where a period-over-period comparison would lie. */
  hideChange?: boolean;
  /** Optional second metric — the card then reads "left / right". */
  secondary?: {
    metric: DashboardMetricKey;
    /** Spelled out in the card label, e.g. "Kullanıcılar (Aktif / Pasif)". */
    leftKey: MessageKey;
    rightKey: MessageKey;
  };
}

export const STAT_CARDS: StatCardConfig[] = [
  {
    id: "orders",
    labelKey: "admin.dashboard.stats.totalOrders",
    icon: ShoppingBagIcon,
    tone: "info",
    format: "count",
    metric: "orders",
  },
  {
    id: "commissionRevenue",
    labelKey: "admin.dashboard.stats.commissionRevenue",
    icon: CurrencyDollarIcon,
    tone: "success",
    format: "currency",
    metric: "commissionRevenue",
  },
  {
    id: "products",
    labelKey: "admin.dashboard.stats.products",
    icon: ChartBarIcon,
    tone: "primary",
    format: "count",
    metric: "activeProducts",
    secondary: {
      metric: "passiveProducts",
      leftKey: "admin.dashboard.stats.active",
      rightKey: "admin.dashboard.stats.passive",
    },
  },
  {
    id: "users",
    labelKey: "admin.dashboard.stats.users",
    icon: UsersIcon,
    tone: "primary",
    format: "count",
    metric: "activeUsers",
    secondary: {
      metric: "passiveUsers",
      leftKey: "admin.dashboard.stats.active",
      rightKey: "admin.dashboard.stats.passive",
    },
  },
  {
    id: "grossSales",
    labelKey: "admin.dashboard.stats.grossSales",
    icon: BanknotesIcon,
    tone: "success",
    format: "currency",
    metric: "grossSales",
  },
  {
    id: "netCommission",
    labelKey: "admin.dashboard.stats.netCommission",
    icon: ArrowTrendingUpIcon,
    tone: "success",
    format: "currency",
    metric: "netCommission",
  },
  {
    id: "visitors",
    labelKey: "admin.dashboard.stats.visitors",
    icon: UserGroupIcon,
    tone: "info",
    format: "count",
    metric: "visitors",
    // `lastActivityAt` keeps one stamp per user, so a visitor active in two
    // periods only counts in the later one — the earlier window is always
    // understated and a period-over-period trend would be nonsense.
    hideChange: true,
  },
  {
    id: "cancellations",
    labelKey: "admin.dashboard.stats.cancellationsRefunds",
    icon: ReceiptRefundIcon,
    tone: "warning",
    format: "count",
    metric: "cancellations",
    secondary: {
      metric: "refunds",
      leftKey: "admin.dashboard.stats.cancellations",
      rightKey: "admin.dashboard.stats.refunds",
    },
  },
];
