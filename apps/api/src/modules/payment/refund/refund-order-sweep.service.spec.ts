import { CancellationActor, Prisma, RefundAttemptStatus } from "@prisma/client";
import { RefundOrderSweepService } from "./refund-order-sweep.service";
import { RefundPendingReconciliationException } from "../../payment-providers/refund-errors";

/**
 * D1 (Sentry TARODAN-API-3M/3N/3P, 156 events in three days for one order):
 * the `payment-expired` cron (every 5 minutes) resent a refund PayTR kept
 * refusing and logged it at error on every run. Now:
 *
 * - each failing order waits longer after every failure (10 min, doubling,
 *   capped at 6 h) and is not even queried while it waits;
 * - the alarm (error, `REFUND_MANUAL_REVIEW`, one line per order id) goes out
 *   once a day per order; the runs in between log a warn;
 * - an order whose refund already has an unresolved attempt (in flight,
 *   succeeded but not finalized, or in manual review) belongs to the attempt
 *   recovery or to a person, not to this sweep: it is not queried;
 * - on staging, orders paid before the last production copy are left out.
 *
 * The backoff state is advisory (Redis): if the cache is down the sweep
 * behaves as before (retries every run, alarms every run).
 */
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const NOW = new Date("2026-10-23T12:00:00.000Z");
const at = (offsetMs: number) => new Date(NOW.getTime() + offsetMs);

type Candidate = { id: string; payment?: { metadata: unknown } | null };

function makeHarness(opts: { copiedBefore?: Date | null } = {}) {
  const store = new Map<string, unknown>();
  const cache = {
    get: jest.fn(async (key: string) => store.get(key) ?? null),
    set: jest.fn(async (key: string, value: unknown) => {
      store.set(key, JSON.parse(JSON.stringify(value)));
    }),
  };
  /** Candidates per branch for the next run: [single, group, returned]. */
  let branches: Candidate[][] = [[], [], []];
  const prisma = {
    order: {
      findMany: jest.fn(async () => branches.shift() ?? []),
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
  const logger = (service as unknown as { logger: Record<string, unknown> })
    .logger;
  const error = jest
    .spyOn(logger as never, "error" as never)
    .mockImplementation((() => undefined) as never);
  const warn = jest
    .spyOn(logger as never, "warn" as never)
    .mockImplementation((() => undefined) as never);
  const nextRun = (candidates: Candidate[][]) => {
    branches = candidates;
    prisma.order.findMany.mockClear();
    paymentRefund.processRefund.mockClear();
    error.mockClear();
    warn.mockClear();
  };
  const wheres = () =>
    (
      prisma.order.findMany.mock.calls as unknown as [
        { where: Prisma.OrderWhereInput & { id?: unknown; OR?: unknown } },
      ][]
    ).map(([args]) => args.where);
  return {
    service,
    prisma,
    paymentRefund,
    productionCopy,
    cache,
    store,
    error,
    warn,
    nextRun,
    wheres,
  };
}

const single = (id: string): Candidate => ({
  id,
  payment: { metadata: {} },
});

describe("RefundOrderSweepService.processRefundedOrders backoff and alarm", () => {
  it("a refused refund is not resent on the next 5-minute run, and alarms once", async () => {
    const h = makeHarness();
    h.nextRun([[single("order-1")], [], []]);
    h.paymentRefund.processRefund.mockRejectedValueOnce(
      new Error(
        "Talep edilen iade tutari (1556 TL), kalan tutardan (15 TL) fazla olamaz.",
      ),
    );

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

    // 5 minutes later: the order is kept out of every candidate query.
    h.nextRun([[], [], []]);
    await h.service.processRefundedOrders(at(5 * MINUTE));
    for (const where of h.wheres()) {
      expect(where.id).toEqual({ notIn: ["order-1"] });
    }
    expect(h.paymentRefund.processRefund).not.toHaveBeenCalled();
    expect(h.error).not.toHaveBeenCalled();
  });

  it("retries after the wait, with a warn instead of a second alarm the same day", async () => {
    const h = makeHarness();
    h.nextRun([[single("order-1")], [], []]);
    h.paymentRefund.processRefund.mockRejectedValue(new Error("refused"));
    await h.service.processRefundedOrders(NOW);

    h.nextRun([[single("order-1")], [], []]);
    await h.service.processRefundedOrders(at(10 * MINUTE));

    expect(h.wheres()[0].id).toBeUndefined();
    expect(h.paymentRefund.processRefund).toHaveBeenCalledTimes(1);
    expect(h.error).not.toHaveBeenCalled();
    expect(h.warn).toHaveBeenCalledWith(expect.stringContaining("order-1"));

    // The second failure doubles the wait: still waiting 15 minutes later.
    h.nextRun([[], [], []]);
    await h.service.processRefundedOrders(at(25 * MINUTE));
    expect(h.wheres()[0].id).toEqual({ notIn: ["order-1"] });
  });

  it("alarms again a day after the last alarm", async () => {
    const h = makeHarness();
    h.paymentRefund.processRefund.mockRejectedValue(new Error("refused"));
    h.nextRun([[single("order-1")], [], []]);
    await h.service.processRefundedOrders(NOW);

    h.nextRun([[single("order-1")], [], []]);
    await h.service.processRefundedOrders(at(24 * HOUR));

    expect(h.error).toHaveBeenCalledTimes(1);
    expect(h.error.mock.calls[0][0]).toEqual(
      expect.stringContaining("order-1"),
    );
  });

  it("one alarm line per order, so each order is its own report", async () => {
    const h = makeHarness();
    h.paymentRefund.processRefund.mockRejectedValue(new Error("refused"));
    h.nextRun([[single("order-1"), single("order-2")], [], []]);

    await h.service.processRefundedOrders(NOW);

    expect(h.error).toHaveBeenCalledTimes(2);
    expect(h.error.mock.calls[0][0]).toContain("order-1");
    expect(h.error.mock.calls[1][0]).toContain("order-2");
  });

  it("a refund handed to attempt reconciliation is a warn: the attempt's own alarm owns it", async () => {
    const h = makeHarness();
    h.paymentRefund.processRefund.mockRejectedValueOnce(
      new RefundPendingReconciliationException(
        "Talep edilen iade tutari (1556 TL), kalan tutardan (0 TL) fazla olamaz.",
      ),
    );
    h.nextRun([[single("order-1")], [], []]);

    await expect(h.service.processRefundedOrders(NOW)).resolves.toEqual({
      refunded: 0,
      failed: 1,
    });

    expect(h.error).not.toHaveBeenCalled();
    expect(h.warn).toHaveBeenCalledWith(expect.stringContaining("order-1"));
    // No backoff of its own: the unresolved attempt keeps it out of the
    // queries until a person or the status inquiry resolves it.
    h.nextRun([[], [], []]);
    await h.service.processRefundedOrders(at(MINUTE));
    expect(h.wheres()[0].id).toBeUndefined();
  });

  it("a success clears the order's backoff", async () => {
    const h = makeHarness();
    h.paymentRefund.processRefund.mockRejectedValueOnce(new Error("refused"));
    h.nextRun([[single("order-1")], [], []]);
    await h.service.processRefundedOrders(NOW);

    h.nextRun([[single("order-1")], [], []]);
    await expect(
      h.service.processRefundedOrders(at(10 * MINUTE)),
    ).resolves.toEqual({ refunded: 1, failed: 0 });

    expect(h.store.get("refund-sweep:backoff")).toEqual({});
    h.nextRun([[], [], []]);
    await h.service.processRefundedOrders(at(11 * MINUTE));
    expect(h.wheres()[0].id).toBeUndefined();
  });

  it("orders whose refund has an unresolved attempt are not swept (manual review stays parked)", async () => {
    const h = makeHarness();

    await h.service.processRefundedOrders(NOW);

    const wheres = h.wheres();
    expect(wheres).toHaveLength(3);
    for (const where of wheres) {
      expect(where.refundAttempts).toEqual({
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
    }
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

  it("without the cache it behaves as before: retries and alarms every run (fail loud)", async () => {
    const h = makeHarness();
    h.cache.get.mockRejectedValue(new Error("redis down"));
    h.cache.set.mockRejectedValue(new Error("redis down"));
    h.paymentRefund.processRefund.mockRejectedValue(new Error("refused"));

    h.nextRun([[single("order-1")], [], []]);
    await h.service.processRefundedOrders(NOW);
    h.nextRun([[single("order-1")], [], []]);
    await h.service.processRefundedOrders(at(5 * MINUTE));

    expect(h.paymentRefund.processRefund).toHaveBeenCalledTimes(1);
    expect(h.error).toHaveBeenCalledTimes(1);
    expect(h.paymentRefund.processRefund).toHaveBeenCalledWith(
      "order-1",
      undefined,
      { cancelledBy: CancellationActor.system },
    );
  });

  it("a stuck returned-shipment order is reported once a day, not every run", async () => {
    const h = makeHarness();
    const stuck: Candidate = {
      id: "returned-refunded",
      payment: { metadata: { refundedOrders: { "returned-refunded": 500 } } },
    };

    h.nextRun([[], [], [stuck]]);
    await h.service.processRefundedOrders(NOW);
    expect(h.warn).toHaveBeenCalledTimes(1);
    expect(h.warn.mock.calls[0][0]).toContain("REFUND_MANUAL_REVIEW");
    expect(h.warn.mock.calls[0][0]).toContain("returned-refunded");

    h.nextRun([[], [], [stuck]]);
    await h.service.processRefundedOrders(at(5 * MINUTE));
    expect(h.warn).not.toHaveBeenCalled();

    h.nextRun([[], [], [stuck]]);
    await h.service.processRefundedOrders(at(24 * HOUR));
    expect(h.warn).toHaveBeenCalledTimes(1);
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
