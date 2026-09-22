import {
  ArrowsRightLeftIcon,
  ArrowTrendingUpIcon,
  ArrowUturnLeftIcon,
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

/** A caveat that applies to both the count and the amount card of a pair. */
const FEE_SPLIT_NOTE: MessageKey = "admin.dashboard.stats.feeSplitIncomplete";

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
  // Kullanıcılara ödenen hak ediş (satıcı escrow + takas nakit hak edişi).
  {
    metric: "sellerPayoutCount",
    labelKey: "admin.dashboard.stats.sellerPayoutCount",
    icon: BanknotesIcon,
    tone: "primary",
    format: "count",
  },
  {
    metric: "sellerPayoutAmount",
    labelKey: "admin.dashboard.stats.sellerPayoutAmount",
    icon: BanknotesIcon,
    tone: "primary",
    format: "currency",
  },
  // Kullanıcılara ödenen İADE (teslim edilmiş siparişin finalize iadesi).
  {
    metric: "returnRefundCount",
    labelKey: "admin.dashboard.stats.returnRefundCount",
    icon: ReceiptRefundIcon,
    tone: "warning",
    format: "count",
  },
  {
    metric: "returnRefundAmount",
    labelKey: "admin.dashboard.stats.returnRefundAmount",
    icon: ReceiptRefundIcon,
    tone: "warning",
    format: "currency",
  },
  // Kullanıcılara ödenen İPTAL (teslim edilmemiş siparişin finalize iadesi).
  {
    metric: "cancelRefundCount",
    labelKey: "admin.dashboard.stats.cancelRefundCount",
    icon: ArrowUturnLeftIcon,
    tone: "danger",
    format: "count",
  },
  {
    metric: "cancelRefundAmount",
    labelKey: "admin.dashboard.stats.cancelRefundAmount",
    icon: ArrowUturnLeftIcon,
    tone: "danger",
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
    metric: "completedTrades",
    labelKey: "admin.dashboard.stats.completedTrades",
    icon: ArrowsRightLeftIcon,
    tone: "info",
    format: "count",
  },
  {
    metric: "completedTradeAmount",
    labelKey: "admin.dashboard.stats.completedTradeAmount",
    icon: ArrowsRightLeftIcon,
    tone: "success",
    format: "currency",
  },
  {
    metric: "tradeFeeRevenue",
    labelKey: "admin.dashboard.stats.tradeFeeRevenue",
    icon: SparklesIcon,
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
    metric: "netRevenueCount",
    labelKey: "admin.dashboard.stats.netRevenueCount",
    icon: ArrowTrendingUpIcon,
    tone: "success",
    format: "count",
  },
  // Tarodan hizmet bedelleri (alıcı + satıcı). Eski (kırılımsız) kayıtlarda
  // bu kartlar 6'ya (Tarodan hak edişi) tam eşitlenmeyebilir — noteKey.
  {
    metric: "serviceFeeCount",
    labelKey: "admin.dashboard.stats.serviceFeeCount",
    icon: SparklesIcon,
    tone: "success",
    format: "count",
    noteKey: FEE_SPLIT_NOTE,
  },
  {
    metric: "serviceFeeAmount",
    labelKey: "admin.dashboard.stats.serviceFeeAmount",
    icon: SparklesIcon,
    tone: "success",
    format: "currency",
    noteKey: FEE_SPLIT_NOTE,
  },
  // Tarodan komisyonları (alıcı + satıcı) — aynı kırılım kısıtı geçerli.
  {
    metric: "commissionCount",
    labelKey: "admin.dashboard.stats.commissionCount",
    icon: ArrowTrendingUpIcon,
    tone: "success",
    format: "count",
    noteKey: FEE_SPLIT_NOTE,
  },
  {
    metric: "commissionAmount",
    labelKey: "admin.dashboard.stats.commissionAmount",
    icon: ArrowTrendingUpIcon,
    tone: "success",
    format: "currency",
    noteKey: FEE_SPLIT_NOTE,
  },
  {
    metric: "shippingCount",
    labelKey: "admin.dashboard.stats.shippingCount",
    icon: TruckIcon,
    tone: "info",
    format: "count",
  },
  {
    metric: "shippingAmount",
    labelKey: "admin.dashboard.stats.shippingAmount",
    icon: TruckIcon,
    tone: "info",
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
    metric: "deliveredAmount",
    labelKey: "admin.dashboard.stats.deliveredAmount",
    icon: TruckIcon,
    tone: "primary",
    format: "currency",
  },
  {
    metric: "membershipRevenue",
    labelKey: "admin.dashboard.stats.membershipRevenue",
    icon: UserGroupIcon,
    tone: "success",
    format: "currency",
  },
  {
    metric: "membershipCount",
    labelKey: "admin.dashboard.stats.membershipCount",
    icon: UserGroupIcon,
    tone: "success",
    format: "count",
  },
  {
    metric: "boostRevenue",
    labelKey: "admin.dashboard.stats.boostRevenue",
    icon: MegaphoneIcon,
    tone: "success",
    format: "currency",
  },
  {
    metric: "boostCount",
    labelKey: "admin.dashboard.stats.boostCount",
    icon: MegaphoneIcon,
    tone: "success",
    format: "count",
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
