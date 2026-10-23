import { CancellationActor, Prisma, RefundAttemptStatus } from "@prisma/client";
import { RefundOrderSweepService } from "./refund-order-sweep.service";
import { RefundPendingReconciliationException } from "../../payment-providers/refund-errors";

/**
 * D1 (Sentry TARODAN-API-3M/3N/3P, 156 events in three days for one order):
 * the `payment-expired` cron (every 5 minutes) resent a refund PayTR kept
 * refusing and logged it at error on every run. Now:
 *
 * - an order whose refund attempt failed waits longer the longer it has been
 *   failing (read from the attempt itself) and is not even queried meanwhile;
 * - the alarm (error, `REFUND_MANUAL_REVIEW`, one line per order id) goes out
 *   once a day per order (atomic claim per order); the runs in between log a
 *   warn; without the cache it alarms every time (fail loud);
 * - an order whose refund has an unresolved attempt belongs to the attempt
 *   recovery or a person; an order whose refund was carried out (finalized,
 *   also a zero-cash settlement) is never refunded again and never fills the
 *   batch;
 * - on staging, orders paid before the last production copy are left out.
 */
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const NOW = new Date("2026-10-23T12:00:00.000Z");
const at = (offsetMs: number) => new Date(NOW.getTime() + offsetMs);

type Candidate = {
  id: string;
  payment?: { metadata: unknown } | null;
  refundAttempts?: { id: string }[];
};
type FailedAttempt = {
  orderId: string;
  failureCount: number;
  updatedAt: Date;
};
type OrderWhere = Prisma.OrderWhereInput & {
  id?: unknown;
  OR?: unknown;
  refundAttempts?: unknown;
};

function makeHarness(
  opts: {
    copiedBefore?: Date | null;
    cacheDown?: boolean;
    /** Whether a failed processRefund left a failed attempt behind. */
    failureLeavesAttempt?: boolean;
  } = {},
) {
  // The alarm claims behave like Redis `SET NX EX` against a test clock.
  let clock = NOW;
  const claims = new Map<string, number>();
  const cache = {
    claimKey: jest.fn(async (key: string, ttlSeconds: number) => {
      if (opts.cacheDown) return "unavailable" as const;
      const expiresAt = claims.get(key);
      if (expiresAt !== undefined && expiresAt > clock.getTime()) {
        return "held" as const;
      }
      claims.set(key, clock.getTime() + ttlSeconds * 1000);
      return "claimed" as const;
    }),
    exists: jest.fn(async (key: string) => {
      if (opts.cacheDown) return false;
      const expiresAt = claims.get(key);
      return expiresAt !== undefined && expiresAt > clock.getTime();
    }),
    setIfAbsent: jest.fn(async (key: string, ttlSeconds: number) => {
      if (opts.cacheDown) return false;
      const expiresAt = claims.get(key);
      if (expiresAt !== undefined && expiresAt > clock.getTime()) return false;
      claims.set(key, clock.getTime() + ttlSeconds * 1000);
      return true;
    }),
  };
  /** Candidates per branch for the next run: [single, group, returned]. */
  let branches: Candidate[][] = [[], [], []];
  let failedAttempts: FailedAttempt[] = [];
  const prisma = {
    order: { findMany: jest.fn(async () => branches.shift() ?? []) },
    refundAttempt: {
      findMany: jest.fn(async () => failedAttempts),
      findFirst: jest.fn(async () =>
        opts.failureLeavesAttempt === false ? null : { id: "attempt-failed" },
      ),
    },
  };
  const paymentRefund = {
    processRefund: jest.fn().mockResolvedValue({ success: true }),
  };
  const productionCopy = {
    copiedBefore: jest.fn().mockResolvedValue(opts.copiedBefore ?? null),
  };
  const service = new RefundOrderSweepService(
    prisma as never,
    paymentRefund as never,
    cache as never,
    productionCopy as never,
  );
  const logger = (
    service as unknown as {
      logger: {
        error: (message: string) => void;
        warn: (message: string) => void;
      };
    }
  ).logger;
  const error = jest.spyOn(logger, "error").mockImplementation(() => undefined);
  const warn = jest.spyOn(logger, "warn").mockImplementation(() => undefined);
  /** Prepares one run at `now` with these candidates and failed attempts. */
  const nextRun = (
    now: Date,
    candidates: Candidate[][],
    failed: FailedAttempt[] = [],
  ) => {
    clock = now;
    branches = candidates;
    failedAttempts = failed;
    prisma.order.findMany.mockClear();
    prisma.refundAttempt.findMany.mockClear();
    paymentRefund.processRefund.mockClear();
    error.mockClear();
    warn.mockClear();
  };
  const wheres = () =>
    (
      prisma.order.findMany.mock.calls as unknown as [{ where: OrderWhere }][]
    ).map(([args]) => args.where);
  return {
    service,
    prisma,
    paymentRefund,
    cache,
    error,
    warn,
    nextRun,
    wheres,
  };
}

const single = (id: string): Candidate => ({ id, payment: { metadata: {} } });
const failedAttempt = (
  orderId: string,
  failureCount: number,
  lastFailedAt: Date,
): FailedAttempt => ({ orderId, failureCount, updatedAt: lastFailedAt });

describe("RefundOrderSweepService.processRefundedOrders backoff (from the attempt ledger)", () => {
  it("reads only the failed attempts that can still be waiting", async () => {
    const h = makeHarness();
    h.nextRun(NOW, [[], [], []]);

    await h.service.processRefundedOrders(NOW);

    expect(h.prisma.refundAttempt.findMany).toHaveBeenCalledWith({
      where: {
        status: RefundAttemptStatus.failed,
        orderId: { not: null },
        updatedAt: { gt: at(-6 * HOUR) },
      },
      select: { orderId: true, failureCount: true, updatedAt: true },
    });
  });

  it("an order whose attempt just failed is kept out of every candidate query", async () => {
    const h = makeHarness();
    h.nextRun(at(5 * MINUTE), [[], [], []], [failedAttempt("order-1", 1, NOW)]);

    await h.service.processRefundedOrders(at(5 * MINUTE));

    const wheres = h.wheres();
    expect(wheres).toHaveLength(3);
    for (const where of wheres) {
      expect(where.id).toEqual({ notIn: ["order-1"] });
    }
    expect(h.paymentRefund.processRefund).not.toHaveBeenCalled();
  });

  it("is due again once its wait is over (10 minutes after a first failure)", async () => {
    const h = makeHarness();
    h.nextRun(
      at(10 * MINUTE),
      [[single("order-1")], [], []],
      [failedAttempt("order-1", 1, NOW)],
    );

    await h.service.processRefundedOrders(at(10 * MINUTE));

    expect(h.wheres()[0].id).toBeUndefined();
    expect(h.paymentRefund.processRefund).toHaveBeenCalledTimes(1);
  });

  it("waits longer after every further failure (from the attempt's failure count)", async () => {
    const h = makeHarness();
    // Third failure 30 minutes ago: waits 40 minutes.
    const failing = failedAttempt("order-1", 3, at(-30 * MINUTE));

    h.nextRun(NOW, [[], [], []], [failing]);
    await h.service.processRefundedOrders(NOW);
    expect(h.wheres()[0].id).toEqual({ notIn: ["order-1"] });

    h.nextRun(at(10 * MINUTE), [[], [], []], [failing]);
    await h.service.processRefundedOrders(at(10 * MINUTE));
    expect(h.wheres()[0].id).toBeUndefined();
  });

  /**
   * Review finding: a failure before the attempt claim (group cap, missing
   * oid) leaves no attempt to wait on and was retried every 5 minutes.
   */
  it("a failure that left no attempt cools down for an hour", async () => {
    const h = makeHarness({ failureLeavesAttempt: false });
    h.paymentRefund.processRefund.mockRejectedValue(
      new Error("refund amount exceeds the limit"),
    );
    h.nextRun(NOW, [[single("order-1")], [], []]);
    await h.service.processRefundedOrders(NOW);
    expect(h.cache.setIfAbsent).toHaveBeenCalledWith(
      "refund-sweep:cooldown:order-1",
      60 * 60,
    );

    h.nextRun(at(30 * MINUTE), [[single("order-1")], [], []]);
    await h.service.processRefundedOrders(at(30 * MINUTE));
    expect(h.paymentRefund.processRefund).not.toHaveBeenCalled();

    h.nextRun(at(61 * MINUTE), [[single("order-1")], [], []]);
    await h.service.processRefundedOrders(at(61 * MINUTE));
    expect(h.paymentRefund.processRefund).toHaveBeenCalledTimes(1);
  });

  it("a failure that left a failed attempt waits on the attempt, no cooldown", async () => {
    const h = makeHarness({ failureLeavesAttempt: true });
    h.paymentRefund.processRefund.mockRejectedValue(new Error("refused"));
    h.nextRun(NOW, [[single("order-1")], [], []]);

    await h.service.processRefundedOrders(NOW);

    expect(h.cache.setIfAbsent).not.toHaveBeenCalled();
    expect(h.prisma.refundAttempt.findFirst).toHaveBeenCalledWith({
      where: {
        orderId: "order-1",
        status: RefundAttemptStatus.failed,
        updatedAt: { gte: expect.any(Date) },
      },
      select: { id: true },
    });
  });
});

describe("RefundOrderSweepService.processRefundedOrders alarm", () => {
  it("first failure: one error line naming the order", async () => {
    const h = makeHarness();
    h.paymentRefund.processRefund.mockRejectedValue(
      new Error(
        "Talep edilen iade tutari (349 TL), kalan tutardan (15 TL) fazla olamaz.",
      ),
    );
    h.nextRun(NOW, [[single("order-1")], [], []]);

    await expect(h.service.processRefundedOrders(NOW)).resolves.toEqual({
      refunded: 0,
      failed: 1,
    });

    expect(h.error).toHaveBeenCalledTimes(1);
    expect(h.error.mock.calls[0][0]).toEqual(
      expect.stringContaining("REFUND_MANUAL_REVIEW"),
    );
    expect(h.error.mock.calls[0][0]).toEqual(
      expect.stringContaining("order-1"),
    );
  });

  it("a repeat the same day is a warn; a day later it alarms again", async () => {
    const h = makeHarness();
    h.paymentRefund.processRefund.mockRejectedValue(new Error("refused"));
    h.nextRun(NOW, [[single("order-1")], [], []]);
    await h.service.processRefundedOrders(NOW);

    h.nextRun(at(10 * MINUTE), [[single("order-1")], [], []]);
    await h.service.processRefundedOrders(at(10 * MINUTE));
    expect(h.error).not.toHaveBeenCalled();
    expect(h.warn).toHaveBeenCalledWith(expect.stringContaining("order-1"));

    h.nextRun(at(24 * HOUR), [[single("order-1")], [], []]);
    await h.service.processRefundedOrders(at(24 * HOUR));
    expect(h.error).toHaveBeenCalledTimes(1);
  });

  it("one alarm line per order, so each order is its own report", async () => {
    const h = makeHarness();
    h.paymentRefund.processRefund.mockRejectedValue(new Error("refused"));
    h.nextRun(NOW, [[single("order-1"), single("order-2")], [], []]);

    await h.service.processRefundedOrders(NOW);

    expect(h.error).toHaveBeenCalledTimes(2);
    expect(h.error.mock.calls[0][0]).toContain("order-1");
    expect(h.error.mock.calls[1][0]).toContain("order-2");
  });

  it("without the cache every failure alarms (fail loud)", async () => {
    const h = makeHarness({ cacheDown: true });
    h.paymentRefund.processRefund.mockRejectedValue(new Error("refused"));

    h.nextRun(NOW, [[single("order-1")], [], []]);
    await h.service.processRefundedOrders(NOW);
    h.nextRun(at(10 * MINUTE), [[single("order-1")], [], []]);
    await h.service.processRefundedOrders(at(10 * MINUTE));

    expect(h.error).toHaveBeenCalledTimes(1);
  });

  it("a refund handed to attempt reconciliation is a warn: the attempt's own alarm owns it", async () => {
    const h = makeHarness();
    h.paymentRefund.processRefund.mockRejectedValueOnce(
      new RefundPendingReconciliationException(
        "Talep edilen iade tutari (1556 TL), kalan tutardan (0 TL) fazla olamaz.",
      ),
    );
    h.nextRun(NOW, [[single("order-1")], [], []]);

    await expect(h.service.processRefundedOrders(NOW)).resolves.toEqual({
      refunded: 0,
      failed: 1,
    });

    expect(h.error).not.toHaveBeenCalled();
    expect(h.warn).toHaveBeenCalledWith(expect.stringContaining("order-1"));
  });

  it("tells processRefund that it raises the alarm itself", async () => {
    const h = makeHarness();
    h.nextRun(NOW, [[single("order-1")], [], []]);

    await h.service.processRefundedOrders(NOW);

    expect(h.paymentRefund.processRefund).toHaveBeenCalledWith(
      "order-1",
      undefined,
      { cancelledBy: CancellationActor.system, callerAlarms: true },
    );
  });

  it("a stuck returned-shipment order is reported once a day, not every run", async () => {
    const h = makeHarness();
    const stuck: Candidate = {
      id: "returned-refunded",
      payment: { metadata: { refundedOrders: { "returned-refunded": 500 } } },
    };

    h.nextRun(NOW, [[], [], [stuck]]);
    await h.service.processRefundedOrders(NOW);
    expect(h.warn).toHaveBeenCalledTimes(1);
    expect(h.warn.mock.calls[0][0]).toContain("REFUND_MANUAL_REVIEW");
    expect(h.warn.mock.calls[0][0]).toContain("returned-refunded");

    h.nextRun(at(5 * MINUTE), [[], [], [stuck]]);
    await h.service.processRefundedOrders(at(5 * MINUTE));
    expect(h.warn).not.toHaveBeenCalled();

    h.nextRun(at(24 * HOUR), [[], [], [stuck]]);
    await h.service.processRefundedOrders(at(24 * HOUR));
    expect(h.warn).toHaveBeenCalledTimes(1);
  });
});

describe("RefundOrderSweepService.processRefundedOrders candidates", () => {
  const unresolved = [
    RefundAttemptStatus.prepared,
    RefundAttemptStatus.submitting,
    RefundAttemptStatus.succeeded,
    RefundAttemptStatus.manual_review,
  ];

  /**
   * Review finding: closed orders with a carried-out refund (partial, or a
   * zero-cash settlement that records 0 on the payment) matched branches 1-2
   * forever. Filtered only in app code, 50 of them filled the batch and no
   * new cancellation was ever refunded; a zero-cash one would have been
   * refunded in full.
   */
  it("branches 1-2 leave out orders with an unresolved or finalized attempt, in SQL", async () => {
    const h = makeHarness();

    await h.service.processRefundedOrders(NOW);

    const [singleWhere, groupWhere, returnedWhere] = h.wheres();
    for (const where of [singleWhere, groupWhere]) {
      expect(where.refundAttempts).toEqual({
        none: {
          status: { in: [...unresolved, RefundAttemptStatus.finalized] },
        },
      });
    }
    // Branch 3 keeps finalized ones: a closed refund on an open order is the
    // stuck case it reports.
    expect(returnedWhere.refundAttempts).toEqual({
      none: { status: { in: unresolved } },
    });
  });

  it("a returned-shipment order with a zero-cash settlement is reported, never refunded", async () => {
    const h = makeHarness();
    const zeroCash: Candidate = {
      id: "returned-zero-cash",
      payment: { metadata: { refundedOrders: { "returned-zero-cash": 0 } } },
      refundAttempts: [{ id: "attempt-finalized" }],
    };
    h.nextRun(NOW, [[], [], [zeroCash]]);

    await h.service.processRefundedOrders(NOW);

    expect(h.paymentRefund.processRefund).not.toHaveBeenCalled();
    expect(h.warn).toHaveBeenCalledWith(
      expect.stringContaining("returned-zero-cash"),
    );
  });

  it("only branch 3 reads the finalized attempt (branches 1-2 exclude it in SQL)", async () => {
    const h = makeHarness();

    await h.service.processRefundedOrders(NOW);

    const selects = (
      h.prisma.order.findMany.mock.calls as unknown as [
        { select: Record<string, unknown> },
      ][]
    ).map(([args]) => args.select);
    expect(selects[0].refundAttempts).toBeUndefined();
    expect(selects[1].refundAttempts).toBeUndefined();
    expect(selects[2].refundAttempts).toEqual({
      where: { status: RefundAttemptStatus.finalized },
      select: { id: true },
      take: 1,
    });
  });

  it("candidate queries are bounded and ordered", async () => {
    const h = makeHarness();

    await h.service.processRefundedOrders(NOW);

    for (const [args] of h.prisma.order.findMany.mock.calls as unknown as [
      { take: number; orderBy: unknown },
    ][]) {
      expect(args.take).toBe(50);
      expect(args.orderBy).toEqual([{ updatedAt: "asc" }, { id: "asc" }]);
    }
  });
});

describe("RefundOrderSweepService.processRefundedOrders staging guard", () => {
  it("staging: leaves out orders paid before the production copy (all three branches)", async () => {
    const cutoff = new Date("2026-10-20T03:00:00.000Z");
    const h = makeHarness({ copiedBefore: cutoff });
    const sweepable = { OR: [{ isTest: true }, { createdAt: { gt: cutoff } }] };

    await h.service.processRefundedOrders(NOW);

    const [singleWhere, groupWhere, returnedWhere] = h.wheres();
    expect(singleWhere.payment).toEqual({
      is: { status: "completed", ...sweepable },
    });
    expect(groupWhere.checkoutGroup).toEqual({
      is: { payment: { is: { status: "completed", ...sweepable } } },
    });
    expect(returnedWhere.OR).toEqual([
      { payment: { is: sweepable } },
      { checkoutGroup: { is: { payment: { is: sweepable } } } },
    ]);
  });

  it("no production copy (live production): the queries are unchanged", async () => {
    const h = makeHarness({ copiedBefore: null });

    await h.service.processRefundedOrders(NOW);

    const [singleWhere, groupWhere, returnedWhere] = h.wheres();
    expect(singleWhere.payment).toEqual({ is: { status: "completed" } });
    expect(groupWhere.checkoutGroup).toEqual({
      is: { payment: { is: { status: "completed" } } },
    });
    expect(returnedWhere.OR).toBeUndefined();
  });
});
