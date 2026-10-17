import { Prisma } from "@prisma/client";

/**
 * How much of a seller's escrow hold a refund consumes: the ONE formula the
 * refund finalize step writes to `PaymentHold.refundedAmount`.
 *
 * - The refund takes its slice of the hold by `portion` (MONEY-H3: the amount
 *   ratio, or the quantity ratio a policy refund passes as `holdPortion`),
 *   rounded to the kuruş, on top of what earlier refunds consumed.
 * - `retained` is what must be LEFT in the hold after this refund: the seller's
 *   own shipping share when they are not at fault (the hold deducted the full
 *   shipping up front). It caps the cumulative consumption at
 *   `amount − retained`. The cap is cumulative on purpose: v2 puts the share on
 *   the refund that completes the line, after partial refunds took their
 *   slices, and an earlier slice may already reach past the cap (a cheap item
 *   whose hold is small next to the shipping share). The cap then gives that
 *   part back, so the non-faulty seller ends with the share the buyer was
 *   charged for or the platform absorbed. A share above the whole hold leaves
 *   the whole hold.
 *
 * The result never goes below 0 or above `amount`.
 */
export function holdRefundedAmountAfter(input: {
  amount: Prisma.Decimal.Value;
  refundedAmount: Prisma.Decimal.Value | null;
  /** This refund's share of the hold, clamped to [0, 1]. */
  portion: number;
  /** Amount to leave in the hold after this refund; 0 or absent leaves none. */
  retained?: number | null;
}): Prisma.Decimal {
  const amount = new Prisma.Decimal(input.amount);
  const portion = Math.min(Math.max(input.portion, 0), 1);
  const slice = amount
    .times(portion)
    .toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
  let consumed = new Prisma.Decimal(input.refundedAmount ?? 0).plus(slice);
  if (input.retained != null && input.retained > 0) {
    consumed = Prisma.Decimal.min(
      consumed,
      Prisma.Decimal.max(0, amount.minus(input.retained)),
    );
  }
  return Prisma.Decimal.min(
    Prisma.Decimal.max(0, consumed),
    amount,
  ).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
}
