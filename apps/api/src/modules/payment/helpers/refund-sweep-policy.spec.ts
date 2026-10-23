import {
  REFUND_ALARM_INTERVAL_MS,
  REFUND_SWEEP_FIRST_DELAY_MS,
  REFUND_SWEEP_MAX_DELAY_MS,
  dailyAlarms,
  normalizeRefundSweepBackoff,
  pruneRefundSweepBackoff,
  recordRefundSweepFailure,
  refundRetryDelayMs,
  sweepablePaymentWhere,
  waitingOrderIds,
} from "./refund-sweep-policy";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const NOW = new Date("2026-10-23T12:00:00.000Z");
const at = (offsetMs: number) => new Date(NOW.getTime() + offsetMs);

describe("refund sweep backoff", () => {
  it("waits 10 minutes after the first failure and doubles up to 6 hours", () => {
    expect(REFUND_SWEEP_FIRST_DELAY_MS).toBe(10 * MINUTE);
    expect(REFUND_SWEEP_MAX_DELAY_MS).toBe(6 * HOUR);
    expect(
      [1, 2, 3, 4, 5, 6, 7, 50].map((n) => refundRetryDelayMs(n) / MINUTE),
    ).toEqual([10, 20, 40, 80, 160, 320, 360, 360]);
    expect(refundRetryDelayMs(0)).toBe(10 * MINUTE);
  });

  it("first failure: one attempt, retry after 10 minutes, alarm now", () => {
    const { entry, alarm } = recordRefundSweepFailure(undefined, NOW);

    expect(alarm).toBe(true);
    expect(entry).toEqual({
      failures: 1,
      firstFailedAt: NOW.toISOString(),
      nextAttemptAt: at(10 * MINUTE).toISOString(),
      alarmedAt: NOW.toISOString(),
    });
  });

  it("a repeat within a day raises no second alarm and waits longer", () => {
    const first = recordRefundSweepFailure(undefined, NOW).entry;
    const later = at(10 * MINUTE);

    const { entry, alarm } = recordRefundSweepFailure(first, later);

    expect(alarm).toBe(false);
    expect(entry).toEqual({
      failures: 2,
      firstFailedAt: NOW.toISOString(),
      nextAttemptAt: new Date(later.getTime() + 20 * MINUTE).toISOString(),
      alarmedAt: NOW.toISOString(),
    });
  });

  it("alarms again once a day has passed since the last alarm", () => {
    const first = recordRefundSweepFailure(undefined, NOW).entry;
    const nextDay = at(REFUND_ALARM_INTERVAL_MS);

    const { entry, alarm } = recordRefundSweepFailure(first, nextDay);

    expect(alarm).toBe(true);
    expect(entry.alarmedAt).toBe(nextDay.toISOString());
  });

  it("lists the orders still waiting for their next attempt", () => {
    const state = {
      waiting: {
        failures: 1,
        firstFailedAt: NOW.toISOString(),
        nextAttemptAt: at(MINUTE).toISOString(),
        alarmedAt: NOW.toISOString(),
      },
      due: {
        failures: 3,
        firstFailedAt: at(-HOUR).toISOString(),
        nextAttemptAt: at(-MINUTE).toISOString(),
        alarmedAt: at(-HOUR).toISOString(),
      },
    };

    expect(waitingOrderIds(state, NOW)).toEqual(["waiting"]);
  });

  it("drops entries that were not retried for two days (the order left the sweep)", () => {
    const entry = (nextAttemptAt: Date) => ({
      failures: 7,
      firstFailedAt: at(-10 * 24 * HOUR).toISOString(),
      nextAttemptAt: nextAttemptAt.toISOString(),
      alarmedAt: at(-24 * HOUR).toISOString(),
    });

    const pruned = pruneRefundSweepBackoff(
      {
        stale: entry(at(-49 * HOUR)),
        recent: entry(at(-47 * HOUR)),
        future: entry(at(HOUR)),
      },
      NOW,
    );

    expect(Object.keys(pruned).sort()).toEqual(["future", "recent"]);
  });

  it("reads a cached state defensively (a cache miss or junk is an empty state)", () => {
    expect(normalizeRefundSweepBackoff(null)).toEqual({});
    expect(normalizeRefundSweepBackoff("junk")).toEqual({});
    expect(
      normalizeRefundSweepBackoff({
        good: {
          failures: 2,
          firstFailedAt: NOW.toISOString(),
          nextAttemptAt: NOW.toISOString(),
          alarmedAt: null,
        },
        noCount: { nextAttemptAt: NOW.toISOString() },
        badDate: {
          failures: 1,
          firstFailedAt: NOW.toISOString(),
          nextAttemptAt: "not a date",
          alarmedAt: null,
        },
      }),
    ).toEqual({
      good: {
        failures: 2,
        firstFailedAt: NOW.toISOString(),
        nextAttemptAt: NOW.toISOString(),
        alarmedAt: null,
      },
    });
  });
});

describe("dailyAlarms", () => {
  it("alarms new keys, keeps quiet for a day, then alarms again", () => {
    const first = dailyAlarms(null, ["a", "b"], NOW);
    expect(first.due).toEqual(["a", "b"]);
    expect(first.stamps).toEqual({
      a: NOW.toISOString(),
      b: NOW.toISOString(),
    });

    const sameDay = dailyAlarms(first.stamps, ["a", "b"], at(23 * HOUR));
    expect(sameDay.due).toEqual([]);
    expect(sameDay.stamps).toEqual(first.stamps);

    const nextDay = dailyAlarms(first.stamps, ["a"], at(24 * HOUR));
    expect(nextDay.due).toEqual(["a"]);
    // "b" is resolved: its stamp goes, so a relapse alarms at once.
    expect(nextDay.stamps).toEqual({ a: at(24 * HOUR).toISOString() });
  });

  it("treats an unreadable stamp as never alarmed (fail loud)", () => {
    expect(dailyAlarms({ a: "garbage" }, ["a"], NOW).due).toEqual(["a"]);
    expect(dailyAlarms("junk", ["a"], NOW).due).toEqual(["a"]);
  });
});

describe("sweepablePaymentWhere", () => {
  it("no restriction without a production-copy cutoff", () => {
    expect(sweepablePaymentWhere(null)).toEqual({});
  });

  it("with a cutoff: test-lane payments, or payments created after the copy", () => {
    const cutoff = new Date("2026-10-20T03:00:00.000Z");
    expect(sweepablePaymentWhere(cutoff)).toEqual({
      OR: [{ isTest: true }, { createdAt: { gt: cutoff } }],
    });
  });
});
