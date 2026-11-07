import { PaymentStatus, type Prisma } from "@prisma/client";

/**
 * "Was the money taken?" for the admin order screens — the ONE definition.
 * The orders buckets (unpaid vs real), the cancellations tab (which offer
 * orders it lists, the refund state), the refunds tab (which trade cash
 * payments were charged) and their row mappers read it here.
 */

/**
 * Payment statuses that mean the buyer was charged. `refunded` was charged
 * first. A missing payment row, `pending`, `processing` and `failed` are not.
 */
export const CHARGED_PAYMENT_STATUSES: PaymentStatus[] = [
  PaymentStatus.completed,
  PaymentStatus.refunded,
];

/** Whether a payment status means charged. */
export function isChargedPaymentStatus(
  status: PaymentStatus | null | undefined,
): boolean {
  return status != null && CHARGED_PAYMENT_STATUSES.includes(status);
}

/**
 * The charge state an order line carries: its own payment (offer order,
 * legacy single order) and its checkout group's payment (cart).
 */
export const LINE_CHARGE_SELECT = {
  payment: { select: { status: true } },
  checkoutGroup: {
    select: { payment: { select: { status: true } } },
  },
} as const satisfies Prisma.OrderSelect;

export interface LineCharge {
  payment: { status: PaymentStatus } | null;
  checkoutGroup: { payment: { status: PaymentStatus } | null } | null;
}

/** Charged: the order's payment OR its checkout group's payment is charged. */
export function isChargedOrderLine(line: LineCharge): boolean {
  return (
    isChargedPaymentStatus(line.payment?.status) ||
    isChargedPaymentStatus(line.checkoutGroup?.payment?.status)
  );
}

/**
 * A charged order line, as a Prisma filter (`isChargedOrderLine`).
 *
 * NULL safety: the bucket builder puts this under `NOT` for a single-order
 * cart, where `checkoutGroupId` is NULL. `checkoutGroup: { is: ... }` filters
 * on that nullable foreign key, which can evaluate to SQL NULL instead of
 * false, and `NOT NULL` is NULL, which would drop the row from every bucket.
 * The explicit `checkoutGroupId: { not: null }` turns that branch into a hard
 * false (`false AND NULL` is false). The `payment` branch is a back relation
 * (the key is on `payments`): Prisma renders it as `id IN (SELECT order_id
 * ... AND order_id IS NOT NULL)`, which is never NULL, so a missing payment
 * row is plainly "not charged".
 */
export function chargedOrderLineWhere(): Prisma.OrderWhereInput {
  const charged = { status: { in: CHARGED_PAYMENT_STATUSES } };
  return {
    OR: [
      { payment: { is: charged } },
      {
        AND: [
          { checkoutGroupId: { not: null } },
          { checkoutGroup: { is: { payment: { is: charged } } } },
        ],
      },
    ],
  };
}
