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
 * This module is the ONLY reader of the PSP scale. Never read
 * `chargedAmount` (or fall back to `amount` for it) anywhere else: a second
 * copy of the legacy rule drifts.
 */

/** The fields `chargedAmountOf` reads. */
export interface ChargedAmountSource {
  amount: Prisma.Decimal;
  chargedAmount: Prisma.Decimal | null;
}

/**
 * What PayTR charged for the payment, C.
 *
 * `chargedAmount` is written at capture from the captured charge attempt.
 * NULL means a legacy payment, or one captured without an attempt; PayTR
 * then charged exactly `amount` (no installment fee existed). The DB CHECK
 * `payments_charged_amount_check` guarantees `chargedAmount = amount +
 * installmentFeeAmount` whenever it is set.
 */
export function chargedAmountOf(payment: ChargedAmountSource): Prisma.Decimal {
  return payment.chargedAmount ?? payment.amount;
}
