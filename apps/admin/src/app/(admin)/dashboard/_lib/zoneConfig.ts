import {
  ArrowsRightLeftIcon,
  BanknotesIcon,
  BuildingStorefrontIcon,
  DocumentTextIcon,
  ExclamationTriangleIcon,
  InformationCircleIcon,
  LifebuoyIcon,
  MegaphoneIcon,
  ReceiptRefundIcon,
  ShieldExclamationIcon,
  ShoppingBagIcon,
  TagIcon,
  TruckIcon,
  UserGroupIcon,
} from "@heroicons/react/24/outline";
import type { ComponentType } from "react";
import type {
  DashboardAlertKey,
  DashboardAlertSeverity,
  DashboardQueueKey,
  DashboardStockKey,
} from "@tarodan/types";
import type { MessageKey } from "@tarodan/i18n";
import type { MetricTone } from "@/components/MetricCard";

/**
 * How each zone's rows are DRAWN. What they contain, which screen they link to
 * and which set they count come from `@tarodan/types` — both sides read the
 * same catalogue, so a new queue cannot exist on one side only.
 */

type Icon = ComponentType<{ className?: string }>;

/** Queue tile → its icon and tone. Order comes from the shared catalogue. */
export const QUEUE_PRESENTATION: Record<
  DashboardQueueKey,
  { labelKey: MessageKey; icon: Icon; tone: MetricTone }
> = {
  refundRequests: {
    labelKey: "admin.dashboard.queues.refundRequests",
    icon: ReceiptRefundIcon,
    tone: "warning",
  },
  tradeOperations: {
    labelKey: "admin.dashboard.queues.tradeOperations",
    icon: ArrowsRightLeftIcon,
    tone: "info",
  },
  listingModeration: {
    labelKey: "admin.dashboard.queues.listingModeration",
    icon: ShoppingBagIcon,
    tone: "primary",
  },
  sellerApplications: {
    labelKey: "admin.dashboard.queues.sellerApplications",
    icon: BuildingStorefrontIcon,
    tone: "primary",
  },
  supportAndReports: {
    labelKey: "admin.dashboard.queues.supportAndReports",
    icon: LifebuoyIcon,
    tone: "danger",
  },
  moneyOperations: {
    labelKey: "admin.dashboard.queues.moneyOperations",
    icon: BanknotesIcon,
    tone: "success",
  },
  documents: {
    labelKey: "admin.dashboard.queues.documents",
    icon: DocumentTextIcon,
    tone: "info",
  },
  shipping: {
    labelKey: "admin.dashboard.queues.shipping",
    icon: TruckIcon,
    tone: "warning",
  },
};

/** Alert severity → row styling + icon. Light theme only. */
export const ALERT_PRESENTATION: Record<
  DashboardAlertSeverity,
  { icon: Icon; wrap: string; icon_: string }
> = {
  critical: {
    icon: ShieldExclamationIcon,
    wrap: "border-danger-200 bg-danger-50 text-danger-900",
    icon_: "text-danger-600",
  },
  warning: {
    icon: ExclamationTriangleIcon,
    wrap: "border-warning-200 bg-warning-50 text-warning-900",
    icon_: "text-warning-600",
  },
  info: {
    icon: InformationCircleIcon,
    wrap: "border-info-200 bg-info-50 text-info-900",
    icon_: "text-info-600",
  },
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
  preparingDeadlineWithin24h:
    "admin.dashboard.alerts.preparingDeadlineWithin24h",
};

/** Zone D strip: a balance is either money or a headcount. */
export const STOCK_CARDS: Array<{
  key: DashboardStockKey;
  labelKey: MessageKey;
  icon: Icon;
  tone: MetricTone;
  format: "count" | "currency";
}> = [
  {
    key: "escrowBalance",
    labelKey: "admin.dashboard.stock.escrowBalance",
    icon: BanknotesIcon,
    tone: "success",
    format: "currency",
  },
  {
    key: "openSellerDebt",
    labelKey: "admin.dashboard.stock.openSellerDebt",
    icon: ReceiptRefundIcon,
    tone: "warning",
    format: "currency",
  },
  {
    key: "activeListings",
    labelKey: "admin.dashboard.stock.activeListings",
    icon: TagIcon,
    tone: "primary",
    format: "count",
  },
  {
    key: "activeMemberships",
    labelKey: "admin.dashboard.stock.activeMemberships",
    icon: UserGroupIcon,
    tone: "info",
    format: "count",
  },
  {
    key: "activeBoosts",
    labelKey: "admin.dashboard.stock.activeBoosts",
    icon: MegaphoneIcon,
    tone: "info",
    format: "count",
  },
];
