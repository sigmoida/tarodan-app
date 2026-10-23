import {
  REFUND_ALARM_INTERVAL_SECONDS,
  REFUND_SWEEP_FIRST_DELAY_MS,
  REFUND_SWEEP_MAX_DELAY_MS,
  claimRefundAlarm,
  copiedPaymentWhere,
  refundRetryAt,
  sweepablePaymentWhere,
  waitingSubjectIds,
} from "./refund-sweep-policy";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const NOW = new Date("2026-10-23T12:00:00.000Z");
const at = (offsetMs: number) => new Date(NOW.getTime() + offsetMs);

/** A failed attempt after `failures` definite failures, the last `lastMs` ago. */
const failed = (subjectId: string, failures: number, lastMs: number) => ({
  subjectId,
  failureCount: failures,
  updatedAt: at(-lastMs),
});

describe("refundRetryAt (wait read from the RefundAttempt ledger)", () => {
  it("waits 10 minutes after a first failure", () => {
    expect(REFUND_SWEEP_FIRST_DELAY_MS).toBe(10 * MINUTE);
    expect(refundRetryAt(failed("o", 1, 0))).toEqual(at(10 * MINUTE));
  });

  it("doubles the wait with every further failure, at most 6 hours", () => {
    expect(REFUND_SWEEP_MAX_DELAY_MS).toBe(6 * HOUR);
    expect(
      [1, 2, 3, 4, 5, 6, 7, 50].map(
        (n) =>
          (refundRetryAt(failed("o", n, 0)).getTime() - NOW.getTime()) / MINUTE,
      ),
    ).toEqual([10, 20, 40, 80, 160, 320, 360, 360]);
  });

  /**
   * Review finding: measured from the attempt's age, an attempt the status
   * inquiry had just requeued (two days in manual review) waited 6 hours.
   * Time in review is not failing: only definite failures count.
   */
  it("an attempt that never failed definitively (count 0) waits the first step", () => {
    expect(refundRetryAt(failed("o", 0, 0))).toEqual(at(10 * MINUTE));
  });

  /**
   * A requeue (status inquiry: PayTR has no record of the refund) keeps the
   * count: the attempt was refused before and a requeue is no evidence that
   * a resend will now succeed, so it keeps its longer wait.
   */
  it("a requeued attempt keeps the wait of its earlier failures", () => {
    expect(refundRetryAt(failed("o", 4, 0))).toEqual(at(80 * MINUTE));
  });
});

describe("waitingSubjectIds", () => {
  it("lists orders whose latest failure is still in its wait, once each", () => {
    expect(
      waitingSubjectIds(
        [
          failed("waiting", 1, 5 * MINUTE),
          failed("waiting", 3, 30 * MINUTE),
          failed("due", 1, 11 * MINUTE),
          { subjectId: null, failureCount: 1, updatedAt: NOW },
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

describe("copiedPaymentWhere (the complement of sweepablePaymentWhere)", () => {
  it("non-test payments created up to the copy", () => {
    const cutoff = new Date("2026-10-20T03:00:00.000Z");
    expect(copiedPaymentWhere(cutoff)).toEqual({
      isTest: false,
      createdAt: { lte: cutoff },
    });
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
