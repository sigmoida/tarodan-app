import type { Prisma } from "@prisma/client";
import {
  ORDER_CANCELLED_LINE_STATUSES,
  ORDER_LINE_STAGES,
  ORDER_LINE_STAGE_RULES,
  ORDER_REFUND_LINE_RULE,
  ORDER_UNPAID_LINE_STATUSES,
  type OrderCartBucket,
  type OrderLineStage,
} from "@tarodan/types";
import { chargedOrderLineWhere } from "./charged-payment";

/**
 * The Prisma form of the admin order buckets. The list and the counter
 * endpoints call the SAME functions, so a bucket cannot have two definitions.
 * What the buckets mean lives in the `@tarodan/types` `order-buckets.ts`
 * tables; this file only translates them.
 */

/** A cart's bucket: a progress stage or one of the closed buckets. */
export type CartBucket = OrderCartBucket;

/** Lifts a line (Order) condition to the cart model: "at least one line". */
export type LineAdapter<TWhere> = (line: Prisma.OrderWhereInput) => TWhere;

/** CheckoutGroup: the cart's lines are its `orders` relation. */
export const groupLines: LineAdapter<Prisma.CheckoutGroupWhereInput> = (
  line,
) => ({ orders: { some: line } });

/** A single order without a group: the cart is that one line. */
export const singleLine: LineAdapter<Prisma.OrderWhereInput> = (line) => line;

/** An order line in stage `stage`. */
export function orderLineStageWhere(
  stage: OrderLineStage,
): Prisma.OrderWhereInput {
  const rule = ORDER_LINE_STAGE_RULES[stage];
  const status: Prisma.OrderWhereInput = {
    status: { in: [...rule.orderStatuses] },
  };
  if (!rule.shipment) return status;

  const inStatuses: Prisma.OrderWhereInput = {
    shipment: { is: { status: { in: [...rule.shipment.statuses] } } },
  };
  return {
    AND: [
      status,
      rule.shipment.allowMissing
        ? { OR: [{ shipment: { is: null } }, inStatuses] }
        : inStatuses,
    ],
  };
}

/** A line with a refund mark (`ORDER_REFUND_LINE_RULE`). */
export function refundOrderLineWhere(): Prisma.OrderWhereInput {
  return {
    OR: [
      { status: { in: [...ORDER_REFUND_LINE_RULE.orderStatuses] } },
      {
        shipment: {
          is: { status: { in: [...ORDER_REFUND_LINE_RULE.shipmentStatuses] } },
        },
      },
    ],
  };
}

/** A line that is NOT cancelled — "every line cancelled" is its absence. */
export function notCancelledOrderLineWhere(): Prisma.OrderWhereInput {
  return { status: { notIn: [...ORDER_CANCELLED_LINE_STATUSES] } };
}

/**
 * An unpaid line (`isUnpaidOrderLine`): awaiting payment or cancelled, and
 * never charged — a missing payment row included (`chargedOrderLineWhere`
 * explains why its negation is NULL-safe).
 */
export function unpaidOrderLineWhere(): Prisma.OrderWhereInput {
  return {
    AND: [
      { status: { in: [...ORDER_UNPAID_LINE_STATUSES] } },
      { NOT: chargedOrderLineWhere() },
    ],
  };
}

/**
 * A line that is NOT unpaid — "every line unpaid" is its absence. Written
 * positively (the complement of `unpaidOrderLineWhere`): another status, or
 * charged.
 */
export function notUnpaidOrderLineWhere(): Prisma.OrderWhereInput {
  return {
    OR: [
      { status: { notIn: [...ORDER_UNPAID_LINE_STATUSES] } },
      chargedOrderLineWhere(),
    ],
  };
}

/**
 * The LEAST-ADVANCED-PACKAGE rule — the one place it is written.
 *
 * A multi-seller cart sits in the stage of its least advanced package (line):
 * a cart with a "New" package shows in "New" even when its other package was
 * delivered. The cart in stage k = has a line in k and no line in a stage
 * before k.
 *
 * A cart with no line in any stage is CLOSED and lands in exactly one closed
 * bucket, in `orderCartBucketOf`'s order:
 * - a refund mark -> refunds;
 * - no refund mark and no line that is not unpaid -> unpaid;
 * - no refund mark, a line that is not unpaid, no line that is not
 *   cancelled -> cancelled;
 * - no refund mark, a line that is not unpaid, a line that is not
 *   cancelled -> other.
 * So every cart is in exactly one bucket and the counters add up to the
 * number of carts.
 *
 * A package's stage is its least advanced line, so for a cart "least advanced
 * package" and "least advanced line" agree; the rule is written per line so a
 * one-line cart (offer order) goes through the same function.
 */
export function cartBucketWhere<TWhere>(
  bucket: CartBucket,
  lines: LineAdapter<TWhere>,
): TWhere {
  const stages = ORDER_LINE_STAGES.map(orderLineStageWhere);
  const closed = (...parts: TWhere[]) =>
    ({
      AND: [lines({}), { NOT: lines({ OR: stages }) } as TWhere, ...parts],
    }) as TWhere;
  const none = (line: Prisma.OrderWhereInput) =>
    ({ NOT: lines(line) }) as TWhere;

  switch (bucket) {
    case "refunds":
      return closed(lines(refundOrderLineWhere()));
    case "unpaid":
      return closed(
        none(refundOrderLineWhere()),
        none(notUnpaidOrderLineWhere()),
      );
    case "cancelled":
      return closed(
        none(refundOrderLineWhere()),
        lines(notUnpaidOrderLineWhere()),
        none(notCancelledOrderLineWhere()),
      );
    case "other":
      return closed(
        none(refundOrderLineWhere()),
        lines(notUnpaidOrderLineWhere()),
        lines(notCancelledOrderLineWhere()),
      );
    default: {
      const index = ORDER_LINE_STAGES.indexOf(bucket);
      const earlier = stages.slice(0, index);
      const parts: TWhere[] = [lines(stages[index])];
      if (earlier.length > 0) {
        parts.push(none({ OR: earlier }));
      }
      return { AND: parts } as TWhere;
    }
  }
}
