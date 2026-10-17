import type { DashboardMetricKey } from "@tarodan/types";
import type { MessageKey } from "@tarodan/i18n";

/**
 * One stat card: which metric it shows and how it is formatted.
 *
 * The grid renders this list — a card is a row here, not another copy-pasted
 * block of JSX, so adding or reordering cards stays a one-line change.
 */
export interface StatCardConfig {
  labelKey: MessageKey;
  format: "count" | "currency";
  metric: DashboardMetricKey;
  /** A caveat printed under the card — what the number cannot tell you. */
  noteKey?: MessageKey;
}

/** A caveat that applies to both the count and the amount card of a pair. */
const FEE_SPLIT_NOTE: MessageKey = "admin.dashboard.stats.feeSplitIncomplete";

export const STAT_CARDS: StatCardConfig[] = [
  {
    metric: "paidOrders",
    labelKey: "admin.dashboard.stats.paidOrders",
    format: "count",
  },
  {
    metric: "paidAmount",
    labelKey: "admin.dashboard.stats.paidAmount",
    format: "currency",
  },
  // Kullanıcılara ödenen hak ediş (satıcı escrow + takas nakit hak edişi).
  {
    metric: "sellerPayoutCount",
    labelKey: "admin.dashboard.stats.sellerPayoutCount",
    format: "count",
  },
  {
    metric: "sellerPayoutAmount",
    labelKey: "admin.dashboard.stats.sellerPayoutAmount",
    format: "currency",
  },
  // Kullanıcılara ödenen İADE (teslim edilmiş siparişin finalize iadesi).
  {
    metric: "returnRefundCount",
    labelKey: "admin.dashboard.stats.returnRefundCount",
    format: "count",
  },
  {
    metric: "returnRefundAmount",
    labelKey: "admin.dashboard.stats.returnRefundAmount",
    format: "currency",
  },
  // Kullanıcılara ödenen İPTAL (teslim edilmemiş siparişin finalize iadesi).
  {
    metric: "cancelRefundCount",
    labelKey: "admin.dashboard.stats.cancelRefundCount",
    format: "count",
  },
  {
    metric: "cancelRefundAmount",
    labelKey: "admin.dashboard.stats.cancelRefundAmount",
    format: "currency",
  },
  {
    metric: "cancelledOrders",
    labelKey: "admin.dashboard.stats.cancelledOrders",
    format: "count",
    // The cancellation stamp only exists from its migration onwards, so a
    // comparison against an older window would read as a fake improvement.
    noteKey: "admin.dashboard.stats.cancelledFromMigration",
  },
  {
    metric: "completedTrades",
    labelKey: "admin.dashboard.stats.completedTrades",
    format: "count",
  },
  {
    metric: "completedTradeAmount",
    labelKey: "admin.dashboard.stats.completedTradeAmount",
    format: "currency",
  },
  {
    metric: "tradeFeeRevenue",
    labelKey: "admin.dashboard.stats.tradeFeeRevenue",
    format: "currency",
  },
  {
    metric: "netRevenue",
    labelKey: "admin.dashboard.stats.netRevenue",
    format: "currency",
  },
  {
    metric: "netRevenueCount",
    labelKey: "admin.dashboard.stats.netRevenueCount",
    format: "count",
  },
  // Tarodan hizmet bedelleri (alıcı + satıcı). Eski (kırılımsız) kayıtlarda
  // bu kartlar 6'ya (Tarodan hak edişi) tam eşitlenmeyebilir — noteKey.
  {
    metric: "serviceFeeCount",
    labelKey: "admin.dashboard.stats.serviceFeeCount",
    format: "count",
    noteKey: FEE_SPLIT_NOTE,
  },
  {
    metric: "serviceFeeAmount",
    labelKey: "admin.dashboard.stats.serviceFeeAmount",
    format: "currency",
    noteKey: FEE_SPLIT_NOTE,
  },
  // Tarodan komisyonları (alıcı + satıcı) — aynı kırılım kısıtı geçerli.
  {
    metric: "commissionCount",
    labelKey: "admin.dashboard.stats.commissionCount",
    format: "count",
    noteKey: FEE_SPLIT_NOTE,
  },
  {
    metric: "commissionAmount",
    labelKey: "admin.dashboard.stats.commissionAmount",
    format: "currency",
    noteKey: FEE_SPLIT_NOTE,
  },
  {
    metric: "shippingCount",
    labelKey: "admin.dashboard.stats.shippingCount",
    format: "count",
  },
  {
    metric: "shippingAmount",
    labelKey: "admin.dashboard.stats.shippingAmount",
    format: "currency",
  },
  {
    metric: "deliveredOrders",
    labelKey: "admin.dashboard.stats.deliveredOrders",
    format: "count",
  },
  {
    metric: "deliveredAmount",
    labelKey: "admin.dashboard.stats.deliveredAmount",
    format: "currency",
  },
  {
    metric: "membershipRevenue",
    labelKey: "admin.dashboard.stats.membershipRevenue",
    format: "currency",
  },
  {
    metric: "membershipCount",
    labelKey: "admin.dashboard.stats.membershipCount",
    format: "count",
  },
  {
    metric: "boostRevenue",
    labelKey: "admin.dashboard.stats.boostRevenue",
    format: "currency",
  },
  {
    metric: "boostCount",
    labelKey: "admin.dashboard.stats.boostCount",
    format: "count",
  },
  {
    metric: "newUsers",
    labelKey: "admin.dashboard.stats.newUsers",
    format: "count",
  },
  {
    metric: "newListings",
    labelKey: "admin.dashboard.stats.newListings",
    format: "count",
  },
  {
    metric: "signedInUsers",
    labelKey: "admin.dashboard.stats.signedInUsers",
    format: "count",
    // `lastActivityAt` keeps ONE stamp per user, so someone active in two of
    // the card's windows (e.g. yesterday AND this month) only counts in the
    // LATER one — every window but the most recent is understated.
    noteKey: "admin.dashboard.stats.signedInSingleStamp",
  },
];
