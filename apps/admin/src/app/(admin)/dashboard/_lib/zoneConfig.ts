import type {
  DashboardAlertKey,
  DashboardAlertSeverity,
  DashboardQueueKey,
  DashboardStockKey,
} from "@tarodan/types";
import type { MessageKey } from "@tarodan/i18n";

/**
 * How each zone's rows are DRAWN. What they contain, which screen they link to
 * and which set they count come from `@tarodan/types` — both sides read the
 * same catalogue, so a new queue cannot exist on one side only.
 */

/** Queue tile → its label. Order comes from the shared catalogue. */
export const QUEUE_PRESENTATION: Record<
  DashboardQueueKey,
  { labelKey: MessageKey }
> = {
  refundRequests: { labelKey: "admin.dashboard.queues.refundRequests" },
  tradeOperations: { labelKey: "admin.dashboard.queues.tradeOperations" },
  listingModeration: { labelKey: "admin.dashboard.queues.listingModeration" },
  sellerApplications: { labelKey: "admin.dashboard.queues.sellerApplications" },
  supportAndReports: { labelKey: "admin.dashboard.queues.supportAndReports" },
  moneyOperations: { labelKey: "admin.dashboard.queues.moneyOperations" },
  documents: { labelKey: "admin.dashboard.queues.documents" },
  shipping: { labelKey: "admin.dashboard.queues.shipping" },
};

/** Alert severity → the `Alert` variant. Light theme only. */
export const ALERT_PRESENTATION: Record<
  DashboardAlertSeverity,
  { variant: "danger" | "warning" | "info" }
> = {
  critical: { variant: "danger" },
  warning: { variant: "warning" },
  info: { variant: "info" },
};

/**
 * Alert key → its message. Every alert row interpolates `count` and, where the
 * copy names one, `threshold` / `amount` — so the number the operator reads is
 * the number the API measured against.
 */
export const ALERT_MESSAGE_KEY: Record<DashboardAlertKey, MessageKey> = {
  stuckShippedOrders: "admin.dashboard.alerts.stuckShippedOrders",
  stuckWarehouseTrades: "admin.dashboard.alerts.stuckWarehouseTrades",
  stuckOutboundTrades: "admin.dashboard.alerts.stuckOutboundTrades",
  paymentsMissingFromStatement:
    "admin.dashboard.alerts.paymentsMissingFromStatement",
  unresolvedStatementLines: "admin.dashboard.alerts.unresolvedStatementLines",
  commissionLedgerDrift: "admin.dashboard.alerts.commissionLedgerDrift",
  paymentsWithoutOrders: "admin.dashboard.alerts.paymentsWithoutOrders",
  ordersWithoutHold: "admin.dashboard.alerts.ordersWithoutHold",
  outboxDead: "admin.dashboard.alerts.outboxDead",
  outboxStuckProcessing: "admin.dashboard.alerts.outboxStuckProcessing",
  noActiveCommissionRuleSet: "admin.dashboard.alerts.noActiveCommissionRuleSet",
  noActiveShippingTariff: "admin.dashboard.alerts.noActiveShippingTariff",
  staleCouponReservations: "admin.dashboard.alerts.staleCouponReservations",
  deliveredHoldsWithoutRelease:
    "admin.dashboard.alerts.deliveredHoldsWithoutRelease",
  agedCarrierCancellations: "admin.dashboard.alerts.agedCarrierCancellations",
  exhaustedPayoutRetries: "admin.dashboard.alerts.exhaustedPayoutRetries",
  preparingDeadlineApproaching:
    "admin.dashboard.alerts.preparingDeadlineApproaching",
};

/** Zone D strip: a balance is either money or a headcount. */
export const STOCK_CARDS: Array<{
  key: DashboardStockKey;
  labelKey: MessageKey;
  format: "count" | "currency";
}> = [
  {
    key: "escrowBalance",
    labelKey: "admin.dashboard.stock.escrowBalance",
    format: "currency",
  },
  {
    key: "openSellerDebt",
    labelKey: "admin.dashboard.stock.openSellerDebt",
    format: "currency",
  },
  {
    key: "activeListings",
    labelKey: "admin.dashboard.stock.activeListings",
    format: "count",
  },
  {
    key: "activeMemberships",
    labelKey: "admin.dashboard.stock.activeMemberships",
    format: "count",
  },
  {
    key: "activeBoosts",
    labelKey: "admin.dashboard.stock.activeBoosts",
    format: "count",
  },
];
