import { Prisma } from "@prisma/client";

/**
 * The PayTR deduction of one matched sale line (`kesinti_tutari`), split into
 * what it costs the platform anyway and what a segment rule made the
 * platform absorb (ADR 0019, plan 4.6.4).
 *
 * Assumption AS-P6 (plan 12.6, to confirm with PayTR) lives HERE only: the
 * statement's `kesinti_tutari` includes the full installment deduction of
 * the sale. Under it the deduction D of an installment sale is
 * `C * rn`, of which the segment rule's share is the attempt's expected
 * platform cost P (`PaymentChargeAttempt.platformCostAmount`, snapshotted at
 * signing). So:
 *
 *   installment_platform_cost = min(D, P)
 *   psp_fee                   = D - installment_platform_cost
 *
 * and the two always sum to D, which keeps the ledger check
 * `psp_fee + installment_platform_cost = Σ stamped statement fees`. If PayTR
 * bills part of the installment cost only in its monthly invoice (AS-P6
 * wrong), D is smaller than expected: P still goes to the platform cost first
 * and the rate drift warning (`INSTALLMENT_RATE_DRIFT`) shows the gap; the
 * accountant books the monthly part by hand (AS-F4).
 */
export interface StatementFeeSplit {
  /** What the platform pays PayTR on any sale (`psp_fee`). */
  pspFee: Prisma.Decimal;
  /** The installment cost a segment rule made the platform absorb. */
  installmentPlatformCost: Prisma.Decimal;
}

export function splitStatementFee(
  deduction: Prisma.Decimal.Value,
  expectedPlatformCost: Prisma.Decimal.Value | null | undefined,
): StatementFeeSplit {
  const fee = Prisma.Decimal.max(0, new Prisma.Decimal(deduction));
  const expected = Prisma.Decimal.max(
    0,
    new Prisma.Decimal(expectedPlatformCost ?? 0),
  );
  const installmentPlatformCost = Prisma.Decimal.min(fee, expected);
  return {
    pspFee: fee.minus(installmentPlatformCost),
    installmentPlatformCost,
  };
}

/**
 * How far the statement's deduction rate (`kesinti_orani`, percent) may be
 * from the rate the attempt was priced with before it is worth a warning:
 * PayTR's daily rate changes and rounding stay under it.
 */
export const INSTALLMENT_RATE_DRIFT_POINTS = 0.5;

/** The card facts of a statement line and of the charge attempt it paid. */
export interface StatementCardFacts {
  /** Statement `kart_marka`, as PayTR reports it (e.g. "WORLD"). */
  cardBrand: string | null;
  /** Statement `kart_no`, masked (first 6 + last 4). */
  maskedPan: string | null;
  /** Statement `kesinti_orani`, percent. */
  feeRatePct: Prisma.Decimal.Value | null;
}

export interface AttemptCardFacts {
  installmentCount: number;
  /** The BIN family the attempt was priced for (`card_type`). */
  cardFamily: string | null;
  /** The first 6 digits of the BIN the client declared. */
  bin6: string | null;
  /** `rn`: the deduction rate the attempt was priced with, percent. */
  installmentRatePct: Prisma.Decimal.Value | null;
}

export interface StatementCardCheck {
  /** The card PayTR charged is not the one the price was quoted for. */
  cardMismatch: Array<"family" | "bin">;
  /** The deduction rate is off the priced rate by more than the tolerance. */
  rateDriftPoints: Prisma.Decimal | null;
}

/**
 * Letters only, lower case, Turkish letters folded: "WORLD", "World " and
 * "world" agree, so do "Sağlam Kart" and "saglamkart".
 */
function familyKey(value: string): string {
  return value
    .toLowerCase()
    .replace(/ı/g, "i")
    .normalize("NFD")
    .replace(/[^a-z]/g, "");
}

/**
 * Checks a matched installment sale against its charge attempt (plan 5.6):
 * the client declares the BIN and PayTR signs only the count and amount, so
 * the card posted can differ from the one quoted. The money is already
 * collected and the count is right; a different card only means the fee may
 * be under-recovered. The caller alarms, nothing is changed automatically.
 * A single payment (count 1) or a missing fact is never a mismatch.
 */
export function checkStatementCard(
  line: StatementCardFacts,
  attempt: AttemptCardFacts,
): StatementCardCheck {
  const result: StatementCardCheck = {
    cardMismatch: [],
    rateDriftPoints: null,
  };
  if (attempt.installmentCount <= 1) return result;
  if (line.cardBrand && attempt.cardFamily) {
    const brand = familyKey(line.cardBrand);
    if (brand && !brand.startsWith(familyKey(attempt.cardFamily))) {
      result.cardMismatch.push("family");
    }
  }
  const panPrefix = line.maskedPan?.match(/^\d{6}/)?.[0];
  if (panPrefix && attempt.bin6 && panPrefix !== attempt.bin6) {
    result.cardMismatch.push("bin");
  }
  if (line.feeRatePct != null && attempt.installmentRatePct != null) {
    const drift = new Prisma.Decimal(line.feeRatePct)
      .minus(attempt.installmentRatePct)
      .abs();
    if (drift.gt(INSTALLMENT_RATE_DRIFT_POINTS)) {
      result.rateDriftPoints = drift;
    }
  }
  return result;
}
