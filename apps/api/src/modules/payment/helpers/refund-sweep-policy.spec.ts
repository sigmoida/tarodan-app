import {
  REFUND_ALARM_INTERVAL_SECONDS,
  REFUND_SWEEP_FIRST_DELAY_MS,
  REFUND_SWEEP_MAX_DELAY_MS,
  claimRefundAlarm,
  refundRetryAt,
  sweepablePaymentWhere,
  waitingOrderIds,
} from "./refund-sweep-policy";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const NOW = new Date("2026-10-23T12:00:00.000Z");
const at = (offsetMs: number) => new Date(NOW.getTime() + offsetMs);

/** A failed attempt first tried `firstMs` ago and last failed `lastMs` ago. */
const failed = (orderId: string, firstMs: number, lastMs: number) => ({
  orderId,
  createdAt: at(-firstMs),
  updatedAt: at(-lastMs),
});

describe("refundRetryAt (wait read from the RefundAttempt ledger)", () => {
  it("waits 10 minutes after a first failure", () => {
    expect(REFUND_SWEEP_FIRST_DELAY_MS).toBe(10 * MINUTE);
    expect(refundRetryAt(failed("o", 0, 0))).toEqual(at(10 * MINUTE));
  });

  it("waits as long as the attempt has been failing", () => {
    // First tried 40 minutes before its last failure: next try 40 min later.
    expect(refundRetryAt(failed("o", 40 * MINUTE, 0))).toEqual(at(40 * MINUTE));
  });

  it("never waits more than 6 hours", () => {
    expect(REFUND_SWEEP_MAX_DELAY_MS).toBe(6 * HOUR);
    expect(refundRetryAt(failed("o", 3 * 24 * HOUR, 0))).toEqual(at(6 * HOUR));
  });

  it("with the 5-minute cron the tries spread out: 10, 10, 20, 40, 80 ... 360 minutes", () => {
    const createdAt = NOW;
    let updatedAt = NOW;
    const gaps: number[] = [];
    for (let i = 0; i < 9; i++) {
      const retry = refundRetryAt({ orderId: "o", createdAt, updatedAt });
      // The next cron tick at or after the retry instant.
      const tick = Math.ceil(retry.getTime() / (5 * MINUTE)) * 5 * MINUTE;
      gaps.push((tick - updatedAt.getTime()) / MINUTE);
      updatedAt = new Date(tick);
    }
    expect(gaps).toEqual([10, 10, 20, 40, 80, 160, 320, 360, 360]);
  });
});

describe("waitingOrderIds", () => {
  it("lists orders whose latest failure is still in its wait, once each", () => {
    expect(
      waitingOrderIds(
        [
          failed("waiting", 0, 5 * MINUTE),
          failed("waiting", 0, 9 * MINUTE),
          failed("due", 0, 11 * MINUTE),
          { orderId: null, createdAt: NOW, updatedAt: NOW },
        ],
        NOW,
      ),
    ).toEqual(["waiting"]);
  });
});

describe("claimRefundAlarm", () => {
  const cacheAnswering = (answer: "claimed" | "held" | "unavailable") => ({
    claimKey: jest.fn().mockResolvedValue(answer),
  });

  it("alarms on the first claim of the day and stays quiet while it is held", async () => {
    const claimed = cacheAnswering("claimed");
    await expect(claimRefundAlarm(claimed, "k")).resolves.toBe(true);
    expect(claimed.claimKey).toHaveBeenCalledWith(
      "k",
      REFUND_ALARM_INTERVAL_SECONDS,
    );
    expect(REFUND_ALARM_INTERVAL_SECONDS).toBe(24 * 60 * 60);

    await expect(claimRefundAlarm(cacheAnswering("held"), "k")).resolves.toBe(
      false,
    );
  });

  it("alarms when the cache cannot tell (fail loud)", async () => {
    await expect(
      claimRefundAlarm(cacheAnswering("unavailable"), "k"),
    ).resolves.toBe(true);
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
