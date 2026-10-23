import type { Prisma } from "@prisma/client";
import type { CacheService } from "../../cache/cache.service";

/**
 * Cadence of the refund retry sweeps (cron `payment-expired`, every 5
 * minutes). A refund the provider kept refusing used to be resent and logged
 * at error on every run (Sentry TARODAN-API-3M/3N/3P: 156 events in three
 * days for one order).
 *
 * - The wait is read from the durable RefundAttempt ledger, not kept
 *   elsewhere: a `failed` attempt records when it was first tried
 *   (`createdAt`) and when it last failed (`updatedAt`); the longer it has
 *   been failing, the longer the sweep waits (`refundRetryAt`). No second
 *   source of truth, no lock, nothing lost on a cache flush.
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

/** What the backoff reads from a failed `RefundAttempt`. */
export interface FailedRefundAttempt {
  orderId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * When the sweep may try an order again after its attempt failed: the last
 * failure plus as long as the attempt has been failing, between 10 minutes
 * and 6 hours. With the 5-minute cron that is about 10, 10, 20, 40, 80, 160,
 * 320 minutes, then every 6 hours.
 */
export function refundRetryAt(attempt: FailedRefundAttempt): Date {
  const failingForMs =
    attempt.updatedAt.getTime() - attempt.createdAt.getTime();
  const waitMs = Math.min(
    Math.max(failingForMs, REFUND_SWEEP_FIRST_DELAY_MS),
    REFUND_SWEEP_MAX_DELAY_MS,
  );
  return new Date(attempt.updatedAt.getTime() + waitMs);
}

/**
 * Orders the sweep leaves out of its candidate queries right now: a failed
 * attempt of theirs (any key: PayTR just refused this order) is still in its
 * wait.
 */
export function waitingOrderIds(
  failed: readonly FailedRefundAttempt[],
  now: Date,
): string[] {
  const waiting = new Set<string>();
  for (const attempt of failed) {
    if (attempt.orderId && refundRetryAt(attempt).getTime() > now.getTime()) {
      waiting.add(attempt.orderId);
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
