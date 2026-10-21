import {
  BoostSource,
  BoostStatus,
  PaymentStatus,
  Prisma,
} from "@prisma/client";
import { asPaymentMetadata } from "../../../payment/helpers/payment-metadata.types";

/**
 * A paid boost can be refunded (and stopped) while it runs or is paused.
 * Decision D2 (tarodan-ops plan 2026-10-21-listing-boost): an ended boost is
 * not refundable; a stopped one has had its refund.
 */
export const BOOST_REFUNDABLE_STATUSES: readonly BoostStatus[] = [
  BoostStatus.active,
  BoostStatus.paused,
];

export interface BoostRefundFacts {
  source: BoostSource;
  status: BoostStatus;
  /** What the seller paid (the snapshot on the boost). */
  price: Prisma.Decimal;
  refundedAmount: Prisma.Decimal | null;
  orderId: string | null;
  /** The boost order's payment, or null when there is none. */
  payment: {
    status: PaymentStatus;
    amount: Prisma.Decimal;
    metadata: Prisma.JsonValue;
  } | null;
}

/**
 * The most a refund of this boost may return now: what is left of its price,
 * and never more than its payment still holds (an older manual refund of the
 * payment counts). Zero when it is not refundable: a free grant, a boost that
 * is not running or paused, or no completed payment. The one rule for the
 * admin screen's maximum and the refund itself (decision D1: the admin enters
 * any amount up to it; empty means all of it).
 */
export function boostRefundableAmount(facts: BoostRefundFacts): Prisma.Decimal {
  const zero = new Prisma.Decimal(0);
  if (
    facts.source !== BoostSource.purchase ||
    !BOOST_REFUNDABLE_STATUSES.includes(facts.status) ||
    !facts.orderId ||
    facts.payment?.status !== PaymentStatus.completed
  ) {
    return zero;
  }
  const leftOnBoost = facts.price.minus(facts.refundedAmount ?? 0);
  const refundedFromPayment =
    asPaymentMetadata(facts.payment.metadata).refundedOrders?.[facts.orderId] ??
    0;
  const leftOnPayment = facts.payment.amount.minus(refundedFromPayment);
  return Prisma.Decimal.max(
    zero,
    Prisma.Decimal.min(leftOnBoost, leftOnPayment),
  );
}
