import type { Prisma } from "@prisma/client";

/**
 * The two money scales of a payment (ADR 0019):
 *
 * - goods scale, T: `Payment.amount` (and `Order.totalAmount`). Commission,
 *   buyer fees, stopaj, the escrow hold, the seller net and the refund
 *   policy derive from it;
 * - PSP scale, C = T + F: what PayTR charged, with F the installment fee
 *   (vade farkı). Every comparison with a PayTR amount and every PayTR call
 *   uses it.
 *
 * This module is the ONLY reader of the PSP-scale columns
 * (`Payment.chargedAmount`, `Order.installmentFeeAmount`,
 * `RefundAttempt.installmentFeeAmount`). Never derive them inline: a second
 * copy of a rule drifts.
 *
 * Captured vs pending: the columns are written at CAPTURE from the captured
 * charge attempt. Before capture (the callback, the status inquiry or a
 * statement line of a signed form) the expected PayTR amount is that oid's
 * `PaymentChargeAttempt.chargedAmount`, never `chargedAmountOf(payment)`,
 * which is still T. The attempt-by-oid reader joins this module with the
 * direct-form task.
 */

/** The fields `chargedAmountOf` reads. */
export interface ChargedAmountSource {
  amount: Prisma.Decimal;
  chargedAmount: Prisma.Decimal | null;
}

/**
 * What PayTR charged for a CAPTURED payment, C.
 *
 * NULL `chargedAmount` means a legacy payment, or one captured without an
 * attempt; PayTR then charged exactly `amount` (the DB CHECK
 * `payments_charged_amount_check` allows no fee without a charged amount and
 * keeps `chargedAmount = amount + installmentFeeAmount` when it is set).
 * Not for a pending payment: see the module comment.
 */
export function chargedAmountOf(payment: ChargedAmountSource): Prisma.Decimal {
  return payment.chargedAmount ?? payment.amount;
}

/** The fields `orderChargedTotalOf` reads. */
export interface OrderChargedTotalSource {
  totalAmount: Prisma.Decimal;
  installmentFeeAmount: Prisma.Decimal;
}

/**
 * The order's slice of what PayTR charged: its goods total plus the share of
 * the installment fee allocated to it at capture (0 for single payments and
 * legacy orders). The PSP-scale base of the transfer slice and the refund
 * fee share; commission, hold and seller net stay on `totalAmount`.
 */
export function orderChargedTotalOf(
  order: OrderChargedTotalSource,
): Prisma.Decimal {
  return order.totalAmount.plus(order.installmentFeeAmount);
}

/** The fields `refundGoodsPartOf` reads. */
export interface RefundGoodsPartSource {
  amount: Prisma.Decimal;
  installmentFeeAmount: Prisma.Decimal;
}

/**
 * The goods-scale part of a refund attempt: `amount` is the PayTR
 * `return_amount` and includes the installment fee share given back with it
 * (DB CHECK: 0 <= fee share <= amount). Refund caps, "fully refunded" and the
 * group refund limit compare this, never `amount`, with goods totals.
 */
export function refundGoodsPartOf(
  attempt: RefundGoodsPartSource,
): Prisma.Decimal {
  return attempt.amount.minus(attempt.installmentFeeAmount);
}
