import type {
  OrderOriginValue,
  OrderStatusValue,
  ShipmentStatusValue,
} from "./commerce-status";

/**
 * The tab + sub-tab (bucket) vocabulary of the admin orders screen — the ONE
 * source.
 *
 * The API builds its Prisma `where`s from these tables (the list and the
 * counters share one builder); the panel reads its tabs and label keys from
 * here. A bucket's definition changes here and nowhere else.
 *
 * A row is a CART: a CheckoutGroup (GRP) for direct sales, a single order
 * (ORD) for offers. Only the tabs that carry ORDER rows live here; the Offers
 * (every offer, including those that never became an order) and Trades tabs
 * of the same screen read their own lists (see `admin-orders-screen.ts`).
 */

/**
 * Tabs that carry order rows: every order, direct sales, and offers that
 * became an order (`offer_order` — offer-origin ORDs).
 */
export const ADMIN_ORDER_TABS = ["all", "direct_sale", "offer_order"] as const;

export type AdminOrderTab = (typeof ADMIN_ORDER_TABS)[number];

export const ADMIN_ORDER_BUCKETS = [
  "all",
  "new",
  "shipped",
  "in_transit",
  "delivered",
  "cancelled",
  "refunds",
  "unpaid",
  "other",
] as const;

export type AdminOrderBucket = (typeof ADMIN_ORDER_BUCKETS)[number];

/**
 * "All": the sub-tab that applies NO bucket filter — every row of the tab.
 * Same meaning as a request without a bucket; its counter is the tab total.
 */
export const ADMIN_ORDER_ALL_BUCKET = "all" satisfies AdminOrderBucket;

/** Buckets that actually filter rows (everything but "All"). */
export type AdminOrderFilterBucket = Exclude<
  AdminOrderBucket,
  typeof ADMIN_ORDER_ALL_BUCKET
>;

/**
 * The sub-tab of an unscoped visit: the operations work queue, "New". A user
 * or product deep link opens in "All" instead (see the panel `useOrderBucket`).
 */
export const ADMIN_ORDER_DEFAULT_BUCKET = "new" satisfies AdminOrderBucket;

/** The bucket's filter: "All" (or no bucket) means no filter. */
export function adminOrderBucketFilter(
  bucket: AdminOrderBucket | undefined,
): AdminOrderFilterBucket | undefined {
  return bucket === ADMIN_ORDER_ALL_BUCKET ? undefined : bucket;
}

/**
 * The progress stages of an order line (Order), IN PROGRESS ORDER. The order
 * matters: a multi-seller cart sits in the stage of its LEAST advanced
 * package. A line in no stage is a CLOSED line (cancelled, refunded, awaiting
 * payment, failed shipment, ...); a cart with no line in a stage lands in
 * EXACTLY one of `ORDER_CLOSED_BUCKETS` (see `orderCartBucketOf`).
 */
export const ORDER_LINE_STAGES = [
  "new",
  "shipped",
  "in_transit",
  "delivered",
] as const;

export type OrderLineStage = (typeof ORDER_LINE_STAGES)[number];

export interface OrderLineStageRule {
  orderStatuses: readonly OrderStatusValue[];
  /**
   * When the stage also reads the shipment: the allowed shipment statuses and
   * whether a line with no shipment row at all counts in this stage.
   */
  shipment?: {
    statuses: readonly ShipmentStatusValue[];
    allowMissing: boolean;
  };
}

/**
 * - new: paid but not handed to the carrier. The shipment is not read: the
 *   writers that move an order to `shipped` do it in the SAME transaction as
 *   the shipment row, so a paid order never sits with a moving parcel; a
 *   label that was voided and reopened is "new work" as well.
 * - shipped (Handed to Carrier): shipment created / picked up, not moving yet.
 * - in_transit: on the way / out for delivery. A shipment that is `delivered`
 *   while the order has not moved yet also stays here (the delivery handler
 *   moves it shortly).
 * - delivered: delivered + confirmation window + completed.
 * A `shipped` order whose shipment failed, came back or was cancelled is in
 * no stage.
 */
export const ORDER_LINE_STAGE_RULES: Record<
  OrderLineStage,
  OrderLineStageRule
> = {
  new: { orderStatuses: ["paid", "preparing"] },
  shipped: {
    orderStatuses: ["shipped"],
    shipment: {
      statuses: ["pending", "label_created", "picked_up"],
      allowMissing: true,
    },
  },
  in_transit: {
    orderStatuses: ["shipped"],
    shipment: {
      statuses: [
        "in_transit",
        "at_delivery_branch",
        "out_for_delivery",
        "delivered",
      ],
      allowMissing: false,
    },
  },
  delivered: {
    orderStatuses: ["delivered", "awaiting_buyer_confirmation", "completed"],
  },
};

/**
 * The buckets of CLOSED carts — carts with no line in a progress stage — in
 * screen order. That is NOT the precedence; the decision is in
 * `orderCartBucketOf`: refunds, then unpaid, then cancelled, the rest "Other".
 *
 * - refunds: at least one line carries a refund mark — a refund requested /
 *   refunded order, or a parcel coming (or come) back.
 * - unpaid (Payment Not Completed): no refund mark and EVERY line is an unpaid
 *   line (`isUnpaidOrderLine`): the buyer went to payment and never paid
 *   (abandoned checkout, an accepted offer left unpaid), whether the order
 *   still awaits payment or was cancelled at `paymentExpiresAt` or by an
 *   admin. These are not real orders, so they get their own bucket.
 * - cancelled: no refund mark, not every line unpaid, and EVERY line
 *   cancelled — so at least one cancelled line was charged.
 * - other: everything else — a `shipped` order whose shipment failed or was
 *   cancelled, a cart that mixes a charged line with an unpaid one, ...
 *
 * The four buckets are disjoint and cover every closed cart: the counters
 * still add up to the number of carts.
 */
export const ORDER_CLOSED_BUCKETS = [
  "cancelled",
  "refunds",
  "unpaid",
  "other",
] as const;

export type OrderClosedBucket = (typeof ORDER_CLOSED_BUCKETS)[number];

/** A cart's bucket: a progress stage or one of the closed buckets. */
export type OrderCartBucket = OrderLineStage | OrderClosedBucket;

/** A line with a refund mark: the order status or the parcel status. */
export const ORDER_REFUND_LINE_RULE = {
  orderStatuses: ["refund_requested", "refunded"],
  shipmentStatuses: ["return_in_progress", "returned"],
} as const satisfies {
  orderStatuses: readonly OrderStatusValue[];
  shipmentStatuses: readonly ShipmentStatusValue[];
};

/** A cancelled line. */
export const ORDER_CANCELLED_LINE_STATUSES = [
  "cancelled",
] as const satisfies readonly OrderStatusValue[];

/**
 * The statuses an UNPAID line can have: still awaiting payment, or cancelled
 * (payment expiry, buyer or admin). Only together with "not charged"
 * (`OrderLineState.charged`) does such a line count as unpaid: a cancelled
 * line that was charged is a real cancellation.
 */
export const ORDER_UNPAID_LINE_STATUSES = [
  "pending_payment",
  "cancelled",
] as const satisfies readonly OrderStatusValue[];

/**
 * The order origins a tab covers — the source of the list and the counters.
 * An offer order is a single order without a group; the CheckoutGroup source
 * carries direct sales only (see the API `orderListSourceWheres`).
 */
export const ADMIN_ORDER_TAB_ORIGINS: Record<
  AdminOrderTab,
  readonly OrderOriginValue[]
> = {
  all: ["direct_sale", "offer"],
  direct_sale: ["direct_sale"],
  offer_order: ["offer"],
};

/**
 * Tab -> sub-tabs, in screen order. Every tab starts with "All" and carries
 * every bucket ("unpaid" included: an accepted offer left unpaid is an offer
 * order too). The "Pending" / "Expired" split of offers that never became an
 * order lives in the Offers tab's status filter (an offer row is not an
 * order).
 */
export const ADMIN_ORDER_TAB_BUCKETS: Record<
  AdminOrderTab,
  readonly AdminOrderBucket[]
> = {
  all: ADMIN_ORDER_BUCKETS,
  direct_sale: ADMIN_ORDER_BUCKETS,
  offer_order: ADMIN_ORDER_BUCKETS,
};

export const ADMIN_ORDER_BUCKET_I18N_KEYS = {
  all: "admin.operations.orders.buckets.all",
  new: "admin.operations.orders.buckets.new",
  shipped: "admin.operations.orders.buckets.shipped",
  in_transit: "admin.operations.orders.buckets.inTransit",
  delivered: "admin.operations.orders.buckets.delivered",
  cancelled: "admin.operations.orders.buckets.cancelled",
  refunds: "admin.operations.orders.buckets.refunds",
  unpaid: "admin.operations.orders.buckets.unpaid",
  other: "admin.operations.orders.buckets.other",
} as const satisfies Record<AdminOrderBucket, string>;

export function isAdminOrderTab(value: unknown): value is AdminOrderTab {
  return (ADMIN_ORDER_TABS as readonly unknown[]).includes(value);
}

export function isAdminOrderBucketOfTab(
  tab: AdminOrderTab,
  bucket: unknown,
): bucket is AdminOrderBucket {
  return (ADMIN_ORDER_TAB_BUCKETS[tab] as readonly unknown[]).includes(bucket);
}

/** An unknown tab (old bookmark, hand-typed URL) falls back to "All Orders". */
export function resolveAdminOrderTab(value: unknown): AdminOrderTab {
  return isAdminOrderTab(value) ? value : "all";
}

/**
 * A bucket that is not in the tab (or not given) falls back to `fallback` —
 * by default "All", the unfiltered list.
 */
export function resolveAdminOrderBucket(
  tab: AdminOrderTab,
  value: unknown,
  fallback: AdminOrderBucket = ADMIN_ORDER_ALL_BUCKET,
): AdminOrderBucket {
  return isAdminOrderBucketOfTab(tab, value) ? value : fallback;
}

/**
 * The stage of one order line — a plain reading of `ORDER_LINE_STAGE_RULES`.
 * The rules are disjoint, so the first match is the only match; no match
 * means "other".
 */
export function orderLineStageOf(
  orderStatus: OrderStatusValue,
  shipmentStatus: ShipmentStatusValue | null,
): OrderLineStage | "other" {
  for (const stage of ORDER_LINE_STAGES) {
    const rule = ORDER_LINE_STAGE_RULES[stage];
    if (!rule.orderStatuses.includes(orderStatus)) continue;
    if (!rule.shipment) return stage;
    if (shipmentStatus === null) {
      if (rule.shipment.allowMissing) return stage;
      continue;
    }
    if (rule.shipment.statuses.includes(shipmentStatus)) return stage;
  }
  return "other";
}

/** The line facts that decide the bucket. */
export interface OrderLineState {
  status: OrderStatusValue;
  /** The parcel's status; null without a shipment row. */
  shipmentStatus: ShipmentStatusValue | null;
  /**
   * The money was taken: the order's payment OR its checkout group's payment
   * is `completed` or `refunded`. No payment row, `pending`, `processing` or
   * `failed` is not charged (API `helpers/charged-payment.ts`).
   */
  charged: boolean;
}

/** Whether the line carries a refund mark (`ORDER_REFUND_LINE_RULE`). */
export function isRefundOrderLine(line: OrderLineState): boolean {
  const rule = ORDER_REFUND_LINE_RULE;
  return (
    (rule.orderStatuses as readonly OrderStatusValue[]).includes(line.status) ||
    (line.shipmentStatus !== null &&
      (rule.shipmentStatuses as readonly ShipmentStatusValue[]).includes(
        line.shipmentStatus,
      ))
  );
}

/**
 * Whether the line is an unpaid line: awaiting payment or cancelled
 * (`ORDER_UNPAID_LINE_STATUSES`) and never charged.
 */
export function isUnpaidOrderLine(line: OrderLineState): boolean {
  return (
    (ORDER_UNPAID_LINE_STATUSES as readonly OrderStatusValue[]).includes(
      line.status,
    ) && !line.charged
  );
}

/**
 * A cart's bucket — a plain reading of the API's Prisma `where`s (the
 * contract spec compares the two on every status combination). A cart with
 * no line is in no bucket (`null`).
 *
 * 1. The stage of the least advanced line (least-advanced-package rule).
 * 2. With no line in a stage: a refund mark -> refunds; every line unpaid ->
 *    unpaid; every line cancelled (so at least one was charged) ->
 *    cancelled; the rest -> other.
 */
export function orderCartBucketOf(
  lines: readonly OrderLineState[],
): OrderCartBucket | null {
  if (lines.length === 0) return null;
  const stages = lines.map((line) =>
    orderLineStageOf(line.status, line.shipmentStatus),
  );
  for (const stage of ORDER_LINE_STAGES) {
    if (stages.includes(stage)) return stage;
  }
  if (lines.some(isRefundOrderLine)) return "refunds";
  if (lines.every(isUnpaidOrderLine)) return "unpaid";
  const cancelled =
    ORDER_CANCELLED_LINE_STATUSES as readonly OrderStatusValue[];
  if (lines.every((line) => cancelled.includes(line.status))) {
    return "cancelled";
  }
  return "other";
}
