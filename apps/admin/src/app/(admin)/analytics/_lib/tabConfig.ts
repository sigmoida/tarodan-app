import {
  ArrowPathIcon,
  ArrowTrendingUpIcon,
  ArrowsRightLeftIcon,
  BanknotesIcon,
  ChartBarIcon,
  ClockIcon,
  CreditCardIcon,
  CurrencyDollarIcon,
  ExclamationTriangleIcon,
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
import type { AnalyticsTab } from "@tarodan/types";
import type { MessageKey } from "@tarodan/i18n";
import type { MetricTone } from "@/components/MetricCard";

/**
 * What each analytics tab shows — a TABLE, not five hand-written screens.
 *
 * The old tabs were four near-identical JSX files that each re-derived their
 * own cards, charts and empty state; adding a metric meant copying a block.
 * Here a card is a row, and one renderer draws every tab.
 */

export type MetricFormat = "count" | "currency" | "percent" | "days" | "hours";

export interface MetricCardConfig {
  /** Key inside the tab response's `metrics` map. */
  metric: string;
  labelKey: MessageKey;
  icon: ComponentType<{ className?: string }>;
  tone: MetricTone;
  format: MetricFormat;
}

export interface SeriesConfig {
  /** Series keys drawn on ONE chart — they must share a unit. */
  keys: string[];
  kind: "line" | "bar";
  format: Extract<MetricFormat, "count" | "currency">;
}

export interface BreakdownConfig {
  /** Field on the tab response holding `AnalyticsBreakdownRow[]`. */
  field: string;
  titleKey: MessageKey;
  /**
   * `db` rows carry a name from the database and print it as-is; `enum` rows
   * carry a schema value that the SCREEN translates — the API must not ship
   * ready-made Turkish.
   */
  labels: "db" | "enum" | "raw";
  /** Whether the row's headline figure is money or a count. */
  weight: "amount" | "count";
}

export interface TabSections {
  cards: MetricCardConfig[];
  charts: SeriesConfig[];
  funnels: Array<{ field: string; titleKey: MessageKey }>;
  breakdowns: BreakdownConfig[];
  leaders: Array<{ field: string; titleKey: MessageKey }>;
  /** Boost packages carry an extra column, so they get their own slot. */
  boostPackages?: { field: string; titleKey: MessageKey };
}

const card = (
  metric: string,
  icon: ComponentType<{ className?: string }>,
  tone: MetricTone,
  format: MetricFormat,
): MetricCardConfig => ({
  metric,
  labelKey: `admin.analytics.metric.${metric}` as MessageKey,
  icon,
  tone,
  format,
});

const breakdown = (
  field: string,
  labels: BreakdownConfig["labels"],
  weight: BreakdownConfig["weight"],
): BreakdownConfig => ({
  field,
  titleKey: `admin.analytics.section.${field}` as MessageKey,
  labels,
  weight,
});

const section = (field: string) => ({
  field,
  titleKey: `admin.analytics.section.${field}` as MessageKey,
});

export const TAB_SECTIONS: Record<AnalyticsTab, TabSections> = {
  sales: {
    cards: [
      card("gmv", BanknotesIcon, "success", "currency"),
      card("orderCount", ShoppingBagIcon, "info", "count"),
      card("averageBasket", ChartBarIcon, "primary", "currency"),
      card("netRevenue", ArrowTrendingUpIcon, "success", "currency"),
      card("refundedAmount", ReceiptRefundIcon, "danger", "currency"),
      card("discountCost", TagIcon, "warning", "currency"),
      card("platformFundedDiscount", TagIcon, "warning", "currency"),
      card("feeDiscountCost", TagIcon, "warning", "currency"),
      card("collectedShipping", TruckIcon, "info", "currency"),
      card("carrierCost", TruckIcon, "danger", "currency"),
    ],
    charts: [
      { keys: ["gmv", "netRevenue", "refundedAmount"], kind: "line", format: "currency" },
      { keys: ["orderCount"], kind: "bar", format: "count" },
    ],
    funnels: [],
    breakdowns: [
      breakdown("byCategory", "db", "amount"),
      breakdown("byBrand", "db", "amount"),
      breakdown("byPriceBand", "raw", "amount"),
    ],
    leaders: [section("topSellers"), section("topProducts")],
  },

  trade: {
    cards: [
      card("averageTradeValue", ArrowsRightLeftIcon, "primary", "currency"),
      card("tradeFeeRevenue", BanknotesIcon, "success", "currency"),
      card("offersCreated", TagIcon, "info", "count"),
      card("offersResponded", ArrowPathIcon, "info", "count"),
      card("offersAccepted", SparklesIcon, "success", "count"),
      card("offerOrders", ShoppingBagIcon, "success", "count"),
      card("offerResponseRate", ChartBarIcon, "primary", "percent"),
      card("offerConversionRate", ArrowTrendingUpIcon, "primary", "percent"),
    ],
    charts: [
      { keys: ["tradesCreated", "tradesCompleted"], kind: "line", format: "count" },
      { keys: ["tradeFeeRevenue"], kind: "bar", format: "currency" },
    ],
    funnels: [section("funnel"), section("offerFunnel")],
    breakdowns: [
      breakdown("exits", "enum", "count"),
      breakdown("byPricingVersion", "enum", "count"),
    ],
    leaders: [],
  },

  catalog: {
    cards: [
      card("listingsCreated", TagIcon, "info", "count"),
      card("listingsPublished", SparklesIcon, "primary", "count"),
      card("listingsSold", ShoppingBagIcon, "success", "count"),
      card("averagePrice", CurrencyDollarIcon, "primary", "currency"),
      card("medianTimeToSellDays", ClockIcon, "info", "days"),
      card("medianSellerTimeToFirstSaleDays", ClockIcon, "info", "days"),
      card("boostRevenue", MegaphoneIcon, "success", "currency"),
      card("boostCount", MegaphoneIcon, "info", "count"),
      card("averageBoostViewUplift", ArrowTrendingUpIcon, "primary", "count"),
    ],
    charts: [
      { keys: ["listingsPublished", "listingsSold"], kind: "line", format: "count" },
      { keys: ["boostRevenue"], kind: "bar", format: "currency" },
    ],
    funnels: [section("funnel")],
    breakdowns: [
      breakdown("byCategory", "db", "count"),
      breakdown("byPriceBand", "raw", "count"),
      breakdown("byCondition", "enum", "count"),
    ],
    leaders: [],
    boostPackages: section("boostPackages"),
  },

  quality: {
    cards: [
      card("paidOrders", ShoppingBagIcon, "info", "count"),
      card("refundedOrders", ReceiptRefundIcon, "danger", "count"),
      card("refundRate", ExclamationTriangleIcon, "danger", "percent"),
      card("refundedAmount", BanknotesIcon, "danger", "currency"),
      card("cancelledOrders", XCircleIcon, "warning", "count"),
      card("cancellationRate", XCircleIcon, "warning", "percent"),
      card("paymentAttempts", CreditCardIcon, "info", "count"),
      card("failedPayments", CreditCardIcon, "danger", "count"),
      card("paymentFailureRate", ExclamationTriangleIcon, "danger", "percent"),
      card("medianPaidToShippedHours", ClockIcon, "info", "hours"),
      card("medianShippedToDeliveredHours", TruckIcon, "info", "hours"),
      card("medianPaidToDeliveredHours", ClockIcon, "primary", "hours"),
    ],
    charts: [
      {
        keys: ["refundedOrders", "cancelledOrders", "failedPayments"],
        kind: "line",
        format: "count",
      },
    ],
    funnels: [],
    breakdowns: [
      breakdown("refundsByReason", "enum", "count"),
      breakdown("refundsByFault", "enum", "count"),
      breakdown("refundComponents", "enum", "amount"),
      breakdown("cancellationsByReason", "enum", "count"),
      breakdown("cancellationsByType", "enum", "count"),
      breakdown("installmentMix", "raw", "count"),
    ],
    leaders: [],
  },

  membership: {
    cards: [
      card("newMemberships", UserGroupIcon, "success", "count"),
      card("renewals", ArrowPathIcon, "primary", "count"),
      card("churned", XCircleIcon, "danger", "count"),
      card("pastDue", ExclamationTriangleIcon, "warning", "count"),
      card("pastDueNow", ExclamationTriangleIcon, "warning", "count"),
      card("membershipRevenue", BanknotesIcon, "success", "currency"),
    ],
    charts: [
      { keys: ["newMemberships", "renewals"], kind: "bar", format: "count" },
      { keys: ["membershipRevenue"], kind: "line", format: "currency" },
    ],
    funnels: [],
    breakdowns: [breakdown("byTier", "db", "amount")],
    leaders: [],
  },
};

export const TAB_ICONS: Record<
  AnalyticsTab,
  ComponentType<{ className?: string }>
> = {
  sales: CurrencyDollarIcon,
  trade: ArrowsRightLeftIcon,
  catalog: TagIcon,
  quality: ExclamationTriangleIcon,
  membership: UsersIcon,
};
