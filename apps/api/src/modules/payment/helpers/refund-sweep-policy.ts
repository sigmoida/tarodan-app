import type { Prisma } from "@prisma/client";

/**
 * Cadence of the refund retry sweeps (cron `payment-expired`, every 5
 * minutes). A refund the provider kept refusing used to be resent and logged
 * at error on every run (Sentry TARODAN-API-3M/3N/3P: 156 events in three
 * days for one order). Now each failing order waits longer after every
 * failure, and an alarm about one order or attempt goes out at most once a
 * day; the runs in between log a warn.
 *
 * The state is advisory and lives in the cache (Redis): losing it (flush,
 * outage) only means an early retry and an early alarm, which is the old
 * behaviour. Whether money may move is decided by the RefundAttempt ledger,
 * never here.
 */

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;

/** Wait after the first failure; it doubles with every further failure. */
export const REFUND_SWEEP_FIRST_DELAY_MS = 10 * MINUTE_MS;
/** Longest wait between two attempts of one order. */
export const REFUND_SWEEP_MAX_DELAY_MS = 6 * HOUR_MS;
/** At most one alarm per order or attempt in this window. */
export const REFUND_ALARM_INTERVAL_MS = 24 * HOUR_MS;
/**
 * An entry whose next attempt is this far in the past was not retried: the
 * order left the sweep (refunded elsewhere, or parked in manual review).
 */
export const REFUND_SWEEP_STALE_AFTER_MS = 48 * HOUR_MS;

export interface RefundSweepBackoffEntry {
  /** Consecutive failures of the sweep for this order. */
  failures: number;
  firstFailedAt: string;
  /** The sweep does not query the order before this instant. */
  nextAttemptAt: string;
  /** The last alarm (error line) about this order. */
  alarmedAt: string | null;
}

/** Order id -> backoff entry. */
export type RefundSweepBackoff = Record<string, RefundSweepBackoffEntry>;

/** Key -> ISO instant of its last alarm. */
export type AlarmStamps = Record<string, string>;

function isIsoInstant(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

export function refundRetryDelayMs(failures: number): number {
  const doublings = Math.min(Math.max(failures - 1, 0), 30);
  return Math.min(
    REFUND_SWEEP_FIRST_DELAY_MS * 2 ** doublings,
    REFUND_SWEEP_MAX_DELAY_MS,
  );
}

function isAlarmDue(alarmedAt: string | null | undefined, now: Date): boolean {
  if (!isIsoInstant(alarmedAt)) return true;
  return now.getTime() - Date.parse(alarmedAt) >= REFUND_ALARM_INTERVAL_MS;
}

/** A cached value read back defensively: anything malformed is dropped. */
export function normalizeRefundSweepBackoff(raw: unknown): RefundSweepBackoff {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const state: RefundSweepBackoff = {};
  for (const [orderId, value] of Object.entries(raw)) {
    const entry = value as Partial<RefundSweepBackoffEntry> | null;
    if (
      !entry ||
      typeof entry.failures !== "number" ||
      !Number.isFinite(entry.failures) ||
      !isIsoInstant(entry.firstFailedAt) ||
      !isIsoInstant(entry.nextAttemptAt)
    ) {
      continue;
    }
    state[orderId] = {
      failures: entry.failures,
      firstFailedAt: entry.firstFailedAt,
      nextAttemptAt: entry.nextAttemptAt,
      alarmedAt: isIsoInstant(entry.alarmedAt) ? entry.alarmedAt : null,
    };
  }
  return state;
}

/** The order failed again: the next wait, and whether this failure alarms. */
export function recordRefundSweepFailure(
  previous: RefundSweepBackoffEntry | undefined,
  now: Date,
): { entry: RefundSweepBackoffEntry; alarm: boolean } {
  const failures = (previous?.failures ?? 0) + 1;
  const alarm = isAlarmDue(previous?.alarmedAt, now);
  return {
    alarm,
    entry: {
      failures,
      firstFailedAt: previous?.firstFailedAt ?? now.toISOString(),
      nextAttemptAt: new Date(
        now.getTime() + refundRetryDelayMs(failures),
      ).toISOString(),
      alarmedAt: alarm ? now.toISOString() : (previous?.alarmedAt ?? null),
    },
  };
}

/** Orders the sweep must leave out of its candidate queries right now. */
export function waitingOrderIds(
  state: RefundSweepBackoff,
  now: Date,
): string[] {
  return Object.entries(state)
    .filter(([, entry]) => Date.parse(entry.nextAttemptAt) > now.getTime())
    .map(([orderId]) => orderId);
}

/** Drops the entries of orders that left the sweep, so the state stays small. */
export function pruneRefundSweepBackoff(
  state: RefundSweepBackoff,
  now: Date,
): RefundSweepBackoff {
  const pruned: RefundSweepBackoff = {};
  for (const [orderId, entry] of Object.entries(state)) {
    if (
      now.getTime() - Date.parse(entry.nextAttemptAt) <=
      REFUND_SWEEP_STALE_AFTER_MS
    ) {
      pruned[orderId] = entry;
    }
  }
  return pruned;
}

/**
 * Which of `keys` (the ones that still need attention this run) are due for
 * their daily alarm. The returned stamps keep only `keys`: a key that is gone
 * is resolved, so if it comes back it alarms at once.
 */
export function dailyAlarms(
  stored: unknown,
  keys: readonly string[],
  now: Date,
): { due: string[]; stamps: AlarmStamps } {
  const previous =
    stored && typeof stored === "object" && !Array.isArray(stored)
      ? (stored as Record<string, unknown>)
      : {};
  const due: string[] = [];
  const stamps: AlarmStamps = {};
  for (const key of keys) {
    const last = previous[key];
    if (isIsoInstant(last) && !isAlarmDue(last, now)) {
      stamps[key] = last;
    } else {
      due.push(key);
      stamps[key] = now.toISOString();
    }
  }
  return { due, stamps };
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
