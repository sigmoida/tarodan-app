import { DASHBOARD_METRIC_KEYS } from "@tarodan/types";
import { AdminAnalyticsDashboardService } from "./admin-analytics-dashboard.service";

interface RecordedCall {
  model: string;
  method: string;
  args: { where?: Record<string, unknown>; _sum?: Record<string, boolean> };
}

/**
 * Zone C's contract: every metric answers the selected period, the preceding
 * window and all-time from ONE definition, in ONE `$transaction`, and each one
 * measures an EVENT stamp rather than `status + createdAt`.
 */
describe("AdminAnalyticsDashboardService.getDashboardStats", () => {
  const now = new Date(2026, 6, 20, 12, 0, 0);
  const todayStart = new Date(2026, 6, 20);
  const monthStart = new Date(2026, 6, 1);

  let calls: RecordedCall[];
  let prisma: any;
  let cache: any;
  let service: AdminAnalyticsDashboardService;

  /** Every aggregate returns 1 for whatever `_sum` field it asked for. */
  const sumResult = (args: RecordedCall["args"]) => ({
    _sum: Object.fromEntries(
      Object.keys(args._sum ?? {}).map((field) => [field, 1]),
    ),
  });

  /** A Prisma stand-in that records the shape of every query it is handed. */
  function recordingPrisma() {
    const delegate = (model: string) => ({
      count: jest.fn(async (args: RecordedCall["args"]) => {
        calls.push({ model, method: "count", args });
        return 1;
      }),
      aggregate: jest.fn(async (args: RecordedCall["args"]) => {
        calls.push({ model, method: "aggregate", args });
        return sumResult(args);
      }),
    });

    return {
      $transaction: jest.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
      order: delegate("order"),
      user: delegate("user"),
      product: delegate("product"),
      trade: delegate("trade"),
      commissionLedger: delegate("commissionLedger"),
      membershipPayment: delegate("membershipPayment"),
      productBoost: delegate("productBoost"),
      refundRequest: delegate("refundRequest"),
      tradeCashPayment: delegate("tradeCashPayment"),
    };
  }

  /** The where clauses of the three windows a metric's model was asked for. */
  const whereFor = (model: string) =>
    calls.filter((call) => call.model === model).map((call) => call.args.where);

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(now);
    calls = [];
    prisma = recordingPrisma();
    cache = {
      // Cache miss on every read — the metric definitions are what is under test.
      getOrSet: jest.fn(
        async (_key: string, factory: () => Promise<unknown>) => factory(),
      ),
      del: jest.fn(),
      delPattern: jest.fn(),
    };
    service = new AdminAnalyticsDashboardService(prisma, {} as any, cache);
  });

  afterEach(() => jest.useRealTimers());

  it("returns every catalogued metric with period, previous and all-time", async () => {
    const result = await service.getDashboardStats();

    expect(Object.keys(result.metrics).sort()).toEqual(
      [...DASHBOARD_METRIC_KEYS].sort(),
    );
    for (const key of DASHBOARD_METRIC_KEYS) {
      expect(result.metrics[key]).toMatchObject({
        period: expect.any(Number),
        previous: expect.any(Number),
        allTime: expect.any(Number),
      });
    }
  });

  it("asks all three windows from one definition, in one transaction", async () => {
    await service.getDashboardStats();

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.$transaction.mock.calls[0][0]).toHaveLength(
      DASHBOARD_METRIC_KEYS.length * 3,
    );
    expect(calls).toHaveLength(DASHBOARD_METRIC_KEYS.length * 3);
  });

  it("defaults to today and echoes the measured window", async () => {
    const result = await service.getDashboardStats();

    expect(result.range.type).toBe("daily");
    expect(result.range.from).toBe(todayStart.toISOString());
    expect(result.range.to).toBe(now.toISOString());
  });

  it("measures the month to date when asked for the monthly period", async () => {
    const result = await service.getDashboardStats({ period: "monthly" });

    expect(result.range.from).toBe(monthStart.toISOString());
    const cancelled = whereFor("order").filter((where) => where?.cancelledAt);
    expect(cancelled[0]?.cancelledAt).toEqual({
      gte: monthStart,
      lte: now,
    });
  });

  it("measures a custom range inclusively at both ends", async () => {
    const result = await service.getDashboardStats({
      period: "custom",
      from: "2026-07-10",
      to: "2026-07-12",
    });

    expect(result.range.from).toBe(new Date(2026, 6, 10).toISOString());
    expect(result.range.to).toBe(
      new Date(2026, 6, 12, 23, 59, 59, 999).toISOString(),
    );
  });

  describe("measures event stamps, never `status + createdAt`", () => {
    const stampFor = (model: string, field: string) => () => {
      const wheres = whereFor(model).filter((where) => where && field in where);
      expect(wheres).toHaveLength(3);
      return wheres;
    };

    beforeEach(async () => {
      await service.getDashboardStats();
    });

    it("counts cancellations from Order.cancelledAt", () => {
      const wheres = stampFor("order", "cancelledAt")();
      expect(wheres[0]?.cancelledAt).toEqual({ gte: todayStart, lte: now });
      // all-time still measures the EVENT, it just drops the range
      expect(wheres[2]?.cancelledAt).toEqual({ not: null });
    });

    it("counts deliveries from Order.deliveredAt", () => {
      const wheres = stampFor("order", "deliveredAt")();
      expect(wheres[2]?.deliveredAt).toEqual({ not: null });
    });

    it("counts completed trades from Trade.completedAt", () => {
      const wheres = stampFor("trade", "completedAt")();
      expect(wheres[2]?.completedAt).toEqual({ not: null });
    });

    it("counts new listings from Product.publishedAt", () => {
      const wheres = stampFor("product", "publishedAt")();
      expect(wheres[2]?.publishedAt).toEqual({ not: null });
    });

    it("reads refunded money from RefundRequest.refundedAt", () => {
      const wheres = stampFor("refundRequest", "refundedAt")();
      expect(wheres[2]?.refundedAt).toEqual({ not: null });
    });

    it("reads net platform revenue from CommissionLedger.earnedAt", () => {
      const wheres = stampFor("commissionLedger", "earnedAt")();
      expect(wheres[0]).toMatchObject({ status: { not: "waived" } });
      expect(wheres[2]?.earnedAt).toEqual({ not: null });
    });

    it("reads boost revenue from ProductBoost.purchasedAt", () => {
      const wheres = stampFor("productBoost", "purchasedAt")();
      expect(wheres[2]?.purchasedAt).toEqual({ not: null });
    });

    it("counts a paid order through either its own or its group's payment", () => {
      const paid = whereFor("order").filter((where) => where && "OR" in where);
      expect(paid).toHaveLength(6); // adet + tutar, üç pencere
      const [first] = paid as Array<Record<string, any>>;
      expect(first.OR[0].payment.is).toMatchObject({ status: "completed" });
      expect(first.OR[1].checkoutGroup.is.payment.is).toMatchObject({
        status: "completed",
      });
      // virtual (membership / boost) orders never enter the sales figure
      expect(first.origin).toEqual({ not: "platform_service" });
    });
  });

  it("derives the trend from the preceding window of equal length", async () => {
    const result = await service.getDashboardStats();

    // Every stub answers 1, so period == previous → no change.
    expect(result.metrics.cancelledOrders.changePercent).toBe(0);
  });

  it("caches a live period under a bucketed key and a closed range under its own", async () => {
    await service.getDashboardStats();
    await service.getDashboardStats({
      period: "custom",
      from: "2026-07-01",
      to: "2026-07-02",
    });

    const [liveKey, , liveOptions] = cache.getOrSet.mock.calls[0];
    const [closedKey, , closedOptions] = cache.getOrSet.mock.calls[1];

    expect(liveKey).toContain("admin:dashboard:period:v1:daily:");
    expect(liveOptions.ttl).toBe(
      AdminAnalyticsDashboardService.PERIOD_CACHE_TTL_SECONDS,
    );
    // A window that has already closed cannot gain rows — hold it far longer.
    expect(closedKey).toContain("admin:dashboard:period:v1:custom:");
    expect(closedOptions.ttl).toBe(
      AdminAnalyticsDashboardService.CLOSED_RANGE_CACHE_TTL_SECONDS,
    );
  });
});
