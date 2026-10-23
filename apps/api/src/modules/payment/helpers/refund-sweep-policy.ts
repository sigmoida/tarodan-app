import type { Prisma } from "@prisma/client";
import type { CacheService } from "../../cache/cache.service";

/**
 * Cadence of the refund retry sweeps (cron `payment-expired`, every 5
 * minutes). A refund the provider kept refusing used to be resent and logged
 * at error on every run (Sentry TARODAN-API-3M/3N/3P: 156 events in three
 * days for one order).
 *
 * - The wait is read from the durable RefundAttempt ledger, not kept
 *   elsewhere: a `failed` attempt counts its consecutive definite provider
 *   failures (`failureCount`) and records the last one (`updatedAt`); the
 *   wait doubles with each failure (`refundRetryAt`). No second source of
 *   truth, no lock, nothing lost on a cache flush.
 * - A failure that never reached an attempt (a data problem before the
 *   claim: group cap, missing oid) cools down for an hour in the cache
 *   (`REFUND_SWEEP_COOLDOWN_SECONDS`): there is no attempt to read.
 * - An alarm about one order or attempt goes out at most once a day: an
 *   atomic claim per key in the cache (`claimRefundAlarm`). If the cache is
 *   unavailable the alarm goes out (an outage must not hide money alarms).
 */

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;

/** Shortest wait after a failed attempt (two cron runs). */
export const REFUND_SWEEP_FIRST_DELAY_MS = 10 * MINUTE_MS;
/** Longest wait between two tries of one order. */
export const REFUND_SWEEP_MAX_DELAY_MS = 6 * HOUR_MS;
/** At most one alarm per order or attempt in this window. */
export const REFUND_ALARM_INTERVAL_SECONDS = 24 * 60 * 60;
/** Wait after a failure that left no attempt behind (cache cooldown). */
export const REFUND_SWEEP_COOLDOWN_SECONDS = 60 * 60;

/** What the backoff reads from a failed `RefundAttempt`. */
export interface FailedRefundAttempt {
  /** The order or trade the attempt refunds (what the sweep queries by). */
  subjectId: string | null;
  /**
   * Consecutive definite provider failures. A requeue (status inquiry)
   * keeps it; an attempt that only ever went to review has 0.
   */
  failureCount: number;
  updatedAt: Date;
}

/**
 * When the sweep may try an order or trade again after its attempt failed:
 * the last failure plus 10 minutes doubled per further failure, at most 6
 * hours (10, 20, 40, 80, 160, 320, then 360 minutes). The count survives a
 * requeue by the status inquiry on purpose: PayTR refused this attempt
 * before, and "no record of the refund" is no evidence a resend now goes
 * through, so it keeps its longer wait (fewer resends of a refund that keeps
 * failing). An attempt that never failed definitively waits 10 minutes.
 */
export function refundRetryAt(attempt: FailedRefundAttempt): Date {
  const doublings = Math.min(Math.max(attempt.failureCount - 1, 0), 30);
  const waitMs = Math.min(
    REFUND_SWEEP_FIRST_DELAY_MS * 2 ** doublings,
    REFUND_SWEEP_MAX_DELAY_MS,
  );
  return new Date(attempt.updatedAt.getTime() + waitMs);
}

/**
 * Orders or trades the sweep leaves out of its candidate query right now: a
 * failed attempt of theirs (any key: PayTR just refused it) is still in its
 * wait.
 */
export function waitingSubjectIds(
  failed: readonly FailedRefundAttempt[],
  now: Date,
): string[] {
  const waiting = new Set<string>();
  for (const attempt of failed) {
    if (attempt.subjectId && refundRetryAt(attempt).getTime() > now.getTime()) {
      waiting.add(attempt.subjectId);
    }
  }
  return [...waiting];
}

/**
 * True when the alarm under `key` should go out now: the first claim in the
 * window, or the cache cannot tell (fail loud).
 */
export async function claimRefundAlarm(
  cache: Pick<CacheService, "claimKey">,
  key: string,
): Promise<boolean> {
  return (await cache.claimKey(key, REFUND_ALARM_INTERVAL_SECONDS)) !== "held";
}

/**
 * Payments a refund sweep may act on. `copiedBefore` is the staging cutoff of
 * the last production copy (`UatProductionCopyService`): payments created up
 * to it came from production, the PayTR test store refuses their refunds
 * forever, and they are left out. Test-lane payments never reach PayTR
 * (`helpers/test-lane-refund`), so they stay in. Without a cutoff (live
 * production, local) nothing is filtered.
 */
export function sweepablePaymentWhere(
  copiedBefore: Date | null,
): Prisma.PaymentWhereInput {
  return copiedBefore
    ? { OR: [{ isTest: true }, { createdAt: { gt: copiedBefore } }] }
    : {};
}

/**
 * The complement of `sweepablePaymentWhere`: a payment copied from
 * production (for a "has none of these" relation filter, e.g. a trade's
 * cash payments).
 */
export function copiedPaymentWhere(
  copiedBefore: Date,
): Prisma.PaymentWhereInput {
  return { isTest: false, createdAt: { lte: copiedBefore } };
}
