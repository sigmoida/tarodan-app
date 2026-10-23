import { Prisma, RefundAttemptStatus, TradeStatus } from "@prisma/client";
import { RefundTradeSweepService } from "./refund-trade-sweep.service";

/**
 * D1 parity: the trade cash refund retry sweep (`retryFailedTradeRefunds`,
 * every 5 minutes) retried every marked trade on every run, logged an error
 * each time and pushed "refund failed" to the cash payer each time. It now
 * follows the order sweep's rules (helpers/refund-sweep-policy):
 *
 * - a trade whose refund attempt failed waits on the attempt's failure count;
 * - a trade whose refund has an unresolved attempt (e.g. PayTR said nothing
 *   is left: manual review) is not retried;
 * - a failure that left no attempt cools down for an hour;
 * - one alarm line per trade, error at most once a day, warn in between;
 * - the payer is not notified by a retry (`refundTradeCashTracked` notifies
 *   once per failure episode; pinned in its own spec);
 * - on staging, trades paid before the last production copy are left out.
 */
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const NOW = new Date("2026-10-23T12:00:00.000Z");
const at = (offsetMs: number) => new Date(NOW.getTime() + offsetMs);

type FailedAttempt = {
  tradeId: string;
  failureCount: number;
  updatedAt: Date;
};
type TradeWhere = Prisma.TradeWhereInput & { id?: unknown };

function makeHarness(
  opts: {
    copiedBefore?: Date | null;
    cacheDown?: boolean;
    failureLeavesAttempt?: boolean;
  } = {},
) {
  let clock = NOW;
  const keys = new Map<string, number>();
  const held = (key: string) => {
    const expiresAt = keys.get(key);
    return expiresAt !== undefined && expiresAt > clock.getTime();
  };
  const cache = {
    claimKey: jest.fn(async (key: string, ttlSeconds: number) => {
      if (opts.cacheDown) return "unavailable" as const;
      if (held(key)) return "held" as const;
      keys.set(key, clock.getTime() + ttlSeconds * 1000);
      return "claimed" as const;
    }),
    exists: jest.fn(async (key: string) => !opts.cacheDown && held(key)),
    setIfAbsent: jest.fn(async (key: string, ttlSeconds: number) => {
      if (opts.cacheDown || held(key)) return false;
      keys.set(key, clock.getTime() + ttlSeconds * 1000);
      return true;
    }),
  };
  let trades: { id: string }[] = [];
  let failedAttempts: FailedAttempt[] = [];
  const prisma = {
    trade: { findMany: jest.fn(async () => trades) },
    refundAttempt: {
      findMany: jest.fn(async () => failedAttempts),
      findFirst: jest.fn(async () =>
        opts.failureLeavesAttempt === false ? null : { id: "attempt-failed" },
      ),
    },
  };
  const paymentRefund = {
    refundTradeCashTracked: jest
      .fn()
      .mockResolvedValue({ refunded: true, failed: false }),
  };
  const productionCopy = {
    copiedBefore: jest.fn().mockResolvedValue(opts.copiedBefore ?? null),
  };
  const service = new RefundTradeSweepService(
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
  const nextRun = (
    now: Date,
    candidates: string[],
    failed: FailedAttempt[] = [],
  ) => {
    clock = now;
    trades = candidates.map((id) => ({ id }));
    failedAttempts = failed;
    prisma.trade.findMany.mockClear();
    paymentRefund.refundTradeCashTracked.mockClear();
    error.mockClear();
    warn.mockClear();
  };
  const where = (): TradeWhere =>
    (
      prisma.trade.findMany.mock.calls as unknown as [{ where: TradeWhere }][]
    )[0][0].where;
  return { service, prisma, paymentRefund, cache, error, warn, nextRun, where };
}

const refused = { refunded: false, failed: true, reason: "refused" };

describe("RefundTradeSweepService.retryFailedTradeRefunds candidates", () => {
  it("marked trades in a refund-owing status, not owned by an unresolved attempt, ordered and bounded", async () => {
    const h = makeHarness();
    h.nextRun(NOW, []);

    await h.service.retryFailedTradeRefunds(NOW);

    const [args] = h.prisma.trade.findMany.mock.calls[0] as unknown as [
      { where: TradeWhere; orderBy: unknown; take: number; select: unknown },
    ];
    expect(args.where.refundFailureReason).toEqual({ not: null });
    expect(args.where.status).toEqual({
      in: [
        TradeStatus.cancelled,
        TradeStatus.returning,
        TradeStatus.disputed,
        TradeStatus.completed,
      ],
    });
    // "Nothing left" parks the attempt in manual review: never retried here.
    expect(args.where.refundAttempts).toEqual({
      none: {
        status: {
          in: [
            RefundAttemptStatus.prepared,
            RefundAttemptStatus.submitting,
            RefundAttemptStatus.succeeded,
            RefundAttemptStatus.manual_review,
          ],
        },
      },
    });
    expect(args.orderBy).toEqual([{ refundFailureAt: "asc" }, { id: "asc" }]);
    expect(args.take).toBe(50);
    expect(args.select).toEqual({ id: true });
  });

  it("a trade whose attempt just failed waits on its failure count", async () => {
    const h = makeHarness();
    h.nextRun(
      at(15 * MINUTE),
      [],
      [{ tradeId: "trade-1", failureCount: 2, updatedAt: NOW }],
    );

    await h.service.retryFailedTradeRefunds(at(15 * MINUTE));

    expect(h.prisma.refundAttempt.findMany).toHaveBeenCalledWith({
      where: {
        status: RefundAttemptStatus.failed,
        tradeId: { not: null },
        updatedAt: { gt: at(15 * MINUTE - 6 * HOUR) },
      },
      select: { tradeId: true, failureCount: true, updatedAt: true },
    });
    // Second failure: waits 20 minutes, so still out at +15.
    expect(h.where().id).toEqual({ notIn: ["trade-1"] });
  });

  it("is retried once its wait is over", async () => {
    const h = makeHarness();
    h.nextRun(
      at(20 * MINUTE),
      ["trade-1"],
      [{ tradeId: "trade-1", failureCount: 2, updatedAt: NOW }],
    );

    await h.service.retryFailedTradeRefunds(at(20 * MINUTE));

    expect(h.where().id).toBeUndefined();
    expect(h.paymentRefund.refundTradeCashTracked).toHaveBeenCalledWith(
      "trade-1",
      { callerAlarms: true },
    );
  });

  /**
   * `refundTradeCashTracked` stays quiet on a repeat failure only for an
   * unscoped call; a scoped one (payerId) always notifies its party. The
   * sweep must therefore never scope its call, or every retry would push
   * "refund failed" again.
   */
  it("never scopes its call to a payer, so a retry cannot notify", async () => {
    const h = makeHarness();
    h.nextRun(NOW, ["trade-1", "trade-2"]);

    await h.service.retryFailedTradeRefunds(NOW);

    for (const call of h.paymentRefund.refundTradeCashTracked.mock.calls) {
      expect(call).toEqual([expect.any(String), { callerAlarms: true }]);
      expect(call[1]).not.toHaveProperty("payerId");
    }
    expect(h.paymentRefund.refundTradeCashTracked).toHaveBeenCalledTimes(2);
  });

  it("staging: trades paid before the production copy are left out", async () => {
    const cutoff = new Date("2026-10-20T03:00:00.000Z");
    const h = makeHarness({ copiedBefore: cutoff });

    await h.service.retryFailedTradeRefunds(NOW);

    expect(h.where().cashPayments).toEqual({
      none: {
        payment: { is: { isTest: false, createdAt: { lte: cutoff } } },
      },
    });
  });

  it("live production: no copy filter", async () => {
    const h = makeHarness({ copiedBefore: null });

    await h.service.retryFailedTradeRefunds(NOW);

    expect(h.where().cashPayments).toBeUndefined();
  });
});

describe("RefundTradeSweepService.retryFailedTradeRefunds outcome and alarm", () => {
  it("counts recovered trades", async () => {
    const h = makeHarness();
    h.paymentRefund.refundTradeCashTracked
      .mockResolvedValueOnce({ refunded: true, failed: false })
      .mockResolvedValueOnce(refused);
    h.nextRun(NOW, ["trade-1", "trade-2"]);

    await expect(h.service.retryFailedTradeRefunds(NOW)).resolves.toEqual({
      retried: 2,
      recovered: 1,
    });
  });

  it("a failure alarms once a day per trade, warn in between", async () => {
    const h = makeHarness();
    h.paymentRefund.refundTradeCashTracked.mockResolvedValue(refused);

    h.nextRun(NOW, ["trade-1"]);
    await h.service.retryFailedTradeRefunds(NOW);
    expect(h.error).toHaveBeenCalledTimes(1);
    expect(h.error.mock.calls[0][0]).toContain("REFUND_MANUAL_REVIEW");
    expect(h.error.mock.calls[0][0]).toContain("trade-1");

    h.nextRun(at(30 * MINUTE), ["trade-1"]);
    await h.service.retryFailedTradeRefunds(at(30 * MINUTE));
    expect(h.error).not.toHaveBeenCalled();
    expect(h.warn).toHaveBeenCalledWith(expect.stringContaining("trade-1"));

    h.nextRun(at(24 * HOUR), ["trade-1"]);
    await h.service.retryFailedTradeRefunds(at(24 * HOUR));
    expect(h.error).toHaveBeenCalledTimes(1);
  });

  it("without the cache every failure alarms (fail loud)", async () => {
    const h = makeHarness({ cacheDown: true });
    h.paymentRefund.refundTradeCashTracked.mockResolvedValue(refused);

    h.nextRun(NOW, ["trade-1"]);
    await h.service.retryFailedTradeRefunds(NOW);
    h.nextRun(at(30 * MINUTE), ["trade-1"]);
    await h.service.retryFailedTradeRefunds(at(30 * MINUTE));

    expect(h.error).toHaveBeenCalledTimes(1);
  });

  it("a failure that left no attempt cools down for an hour", async () => {
    const h = makeHarness({ failureLeavesAttempt: false });
    h.paymentRefund.refundTradeCashTracked.mockResolvedValue(refused);

    h.nextRun(NOW, ["trade-1"]);
    await h.service.retryFailedTradeRefunds(NOW);
    expect(h.cache.setIfAbsent).toHaveBeenCalledWith(
      "refund-sweep:trade-cooldown:trade-1",
      60 * 60,
    );

    h.nextRun(at(30 * MINUTE), ["trade-1"]);
    await h.service.retryFailedTradeRefunds(at(30 * MINUTE));
    expect(h.paymentRefund.refundTradeCashTracked).not.toHaveBeenCalled();

    h.nextRun(at(61 * MINUTE), ["trade-1"]);
    await h.service.retryFailedTradeRefunds(at(61 * MINUTE));
    expect(h.paymentRefund.refundTradeCashTracked).toHaveBeenCalledTimes(1);
  });

  it("a failure that left a failed attempt waits on the attempt, no cooldown", async () => {
    const h = makeHarness({ failureLeavesAttempt: true });
    h.paymentRefund.refundTradeCashTracked.mockResolvedValue(refused);
    h.nextRun(NOW, ["trade-1"]);

    await h.service.retryFailedTradeRefunds(NOW);

    expect(h.cache.setIfAbsent).not.toHaveBeenCalled();
    expect(h.prisma.refundAttempt.findFirst).toHaveBeenCalledWith({
      where: {
        tradeId: "trade-1",
        status: RefundAttemptStatus.failed,
        updatedAt: { gte: expect.any(Date) },
      },
      select: { id: true },
    });
  });

  it("a refund deferred (PayTR has not booked the payment yet) is no failure", async () => {
    const h = makeHarness();
    h.paymentRefund.refundTradeCashTracked.mockResolvedValue({
      refunded: false,
      failed: false,
      deferred: true,
    });
    h.nextRun(NOW, ["trade-1"]);

    await h.service.retryFailedTradeRefunds(NOW);

    expect(h.error).not.toHaveBeenCalled();
  });
});
