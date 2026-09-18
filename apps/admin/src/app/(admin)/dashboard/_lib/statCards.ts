import {
  ArrowsRightLeftIcon,
  ArrowTrendingUpIcon,
  BanknotesIcon,
  MegaphoneIcon,
  ReceiptRefundIcon,
  ShoppingBagIcon,
  SparklesIcon,
  TagIcon,
  TruckIcon,
  UserGroupIcon,
  UsersIcon,
  XCircleIcon,
} from "@heroicons/react/24/outline";
import type { ComponentType } from "react";
import type { DashboardMetricKey } from "@tarodan/types";
import type { MessageKey } from "@tarodan/i18n";
import type { MetricTone } from "@/components/MetricCard";

/**
 * One stat card: which metric it shows and how it is formatted.
 *
 * The grid renders this list — a card is a row here, not another copy-pasted
 * block of JSX, so adding or reordering cards stays a one-line change.
 */
export interface StatCardConfig {
  labelKey: MessageKey;
  icon: ComponentType<{ className?: string }>;
  tone: MetricTone;
  format: "count" | "currency";
  metric: DashboardMetricKey;
  /** Hides the trend row where a period-over-period comparison would lie. */
  hideChange?: boolean;
  /** A caveat printed under the card — what the number cannot tell you. */
  noteKey?: MessageKey;
}

export const STAT_CARDS: StatCardConfig[] = [
  {
    metric: "paidOrders",
    labelKey: "admin.dashboard.stats.paidOrders",
    icon: ShoppingBagIcon,
    tone: "info",
    format: "count",
  },
  {
    metric: "paidAmount",
    labelKey: "admin.dashboard.stats.paidAmount",
    icon: BanknotesIcon,
    tone: "success",
    format: "currency",
  },
  {
    metric: "netRevenue",
    labelKey: "admin.dashboard.stats.netRevenue",
    icon: ArrowTrendingUpIcon,
    tone: "success",
    format: "currency",
  },
  {
    metric: "deliveredOrders",
    labelKey: "admin.dashboard.stats.deliveredOrders",
    icon: TruckIcon,
    tone: "primary",
    format: "count",
  },
  {
    metric: "membershipRevenue",
    labelKey: "admin.dashboard.stats.membershipRevenue",
    icon: UserGroupIcon,
    tone: "success",
    format: "currency",
  },
  {
    metric: "boostRevenue",
    labelKey: "admin.dashboard.stats.boostRevenue",
    icon: MegaphoneIcon,
    tone: "success",
    format: "currency",
  },
  {
    metric: "completedTrades",
    labelKey: "admin.dashboard.stats.completedTrades",
    icon: ArrowsRightLeftIcon,
    tone: "info",
    format: "count",
  },
  {
    metric: "tradeFeeRevenue",
    labelKey: "admin.dashboard.stats.tradeFeeRevenue",
    icon: SparklesIcon,
    tone: "success",
    format: "currency",
  },
  {
    metric: "refundedAmount",
    labelKey: "admin.dashboard.stats.refundedAmount",
    icon: ReceiptRefundIcon,
    tone: "warning",
    format: "currency",
  },
  {
    metric: "cancelledOrders",
    labelKey: "admin.dashboard.stats.cancelledOrders",
    icon: XCircleIcon,
    tone: "warning",
    format: "count",
    // The cancellation stamp only exists from its migration onwards, so a
    // comparison against an older window would read as a fake improvement.
    noteKey: "admin.dashboard.stats.cancelledFromMigration",
  },
  {
    metric: "newUsers",
    labelKey: "admin.dashboard.stats.newUsers",
    icon: UsersIcon,
    tone: "primary",
    format: "count",
  },
  {
    metric: "newListings",
    labelKey: "admin.dashboard.stats.newListings",
    icon: TagIcon,
    tone: "primary",
    format: "count",
  },
  {
    metric: "signedInUsers",
    labelKey: "admin.dashboard.stats.signedInUsers",
    icon: UserGroupIcon,
    tone: "info",
    format: "count",
    // `lastActivityAt` keeps one stamp per user, so someone active in two
    // periods only counts in the later one — the earlier window is always
    // understated and a period-over-period trend would be nonsense.
    hideChange: true,
  },
];
