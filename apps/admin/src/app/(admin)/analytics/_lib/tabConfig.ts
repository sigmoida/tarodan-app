import {
  ArrowsRightLeftIcon,
  CurrencyDollarIcon,
  ExclamationTriangleIcon,
  TagIcon,
  UsersIcon,
} from "@heroicons/react/24/outline";
import type { ComponentType } from "react";
import type { AnalyticsTab } from "@tarodan/types";
import type { MessageKey } from "@tarodan/i18n";

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
  format: MetricFormat;
  /** A caveat printed under the card — what the number cannot tell you. */
  noteKey?: MessageKey;
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
  format: MetricFormat,
  noteKey?: MessageKey,
): MetricCardConfig => ({
  metric,
  labelKey: `admin.analytics.metric.${metric}` as MessageKey,
  format,
  noteKey,
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
      card("gmv", "currency"),
      card("orderCount", "count"),
      card("averageBasket", "currency"),
      card("netRevenue", "currency"),
      card("refundedAmount", "currency"),
      card("discountCost", "currency"),
      card("platformFundedDiscount", "currency"),
      card("feeDiscountCost", "currency"),
      card("collectedShipping", "currency"),
      card(
        "carrierCost",
        "currency",
        "admin.analytics.notes.carrierCostReconciledOnly",
      ),
      card("shipmentsAwaitingCarrierCost", "count"),
      card("carrierCostReconciledShare", "percent"),
    ],
    charts: [
      {
        keys: ["gmv", "netRevenue", "refundedAmount"],
        kind: "line",
        format: "currency",
      },
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
      card("averageTradeValue", "currency"),
      card("tradeFeeRevenue", "currency"),
      card("offersCreated", "count"),
      card("offersResponded", "count"),
      card("offersAccepted", "count"),
      card("offerOrders", "count"),
      card("offerResponseRate", "percent"),
      card("offerConversionRate", "percent"),
    ],
    charts: [
      {
        keys: ["tradesCreated", "tradesCompleted"],
        kind: "line",
        format: "count",
      },
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
      card("listingsCreated", "count"),
      card("listingsPublished", "count"),
      card("listingsSold", "count"),
      card("averagePrice", "currency"),
      card("medianTimeToSellDays", "days"),
      card("medianSellerTimeToFirstSaleDays", "days"),
      card("boostRevenue", "currency"),
      card("boostCount", "count"),
      card("averageBoostViewUplift", "count"),
    ],
    charts: [
      {
        keys: ["listingsPublished", "listingsSold"],
        kind: "line",
        format: "count",
      },
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
      card("paidOrders", "count"),
      card("refundedOrders", "count"),
      card("refundRate", "percent"),
      card("refundedAmount", "currency"),
      card("cancelledOrders", "count"),
      card("cancellationRate", "percent"),
      card("paymentAttempts", "count"),
      card("failedPayments", "count"),
      card("paymentFailureRate", "percent"),
      card("medianPaidToShippedHours", "hours"),
      card("medianShippedToDeliveredHours", "hours"),
      card("medianPaidToDeliveredHours", "hours"),
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
      card("newMemberships", "count"),
      card("renewals", "count"),
      card("churned", "count"),
      card("pastDue", "count"),
      card("pastDueNow", "count"),
      card("membershipRevenue", "currency"),
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
