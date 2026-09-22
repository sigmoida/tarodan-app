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
  let rawSqlCalls: Array<{ sql: string; values: unknown[] }>;
  let prisma: any;
  let cache: any;
  let service: AdminAnalyticsDashboardService;

  /**
   * Every aggregate returns 1, 2, 3, … for whatever `_sum` fields it asked
   * for, IN THE ORDER THEY WERE REQUESTED. A single-field aggregate still
   * answers 1 (unchanged from before); a multi-field one (7 and 8's split
   * math) gets distinguishable values so a wrong formula (e.g. summing
   * instead of netting refunds) would produce a different, wrong number.
   */
  const sumResult = (args: RecordedCall["args"]) => ({
    _sum: Object.fromEntries(
      Object.keys(args._sum ?? {}).map((field, index) => [field, index + 1]),
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
      // Sole raw-SQL definition today (sellerPayoutAmount): COALESCE between
      // two columns can't be expressed with `_sum`. The fragment's own
      // `.sql`/`.values` are pinned by `completed-payout.predicate.spec.ts`;
      // here we only need the service to actually call it, once per window.
      $queryRaw: jest.fn(
        (_strings: TemplateStringsArray, ...values: unknown[]) => {
          calls.push({
            model: "payoutTransfer",
            method: "$queryRaw",
            args: {},
          });
          rawSqlCalls.push(values[0] as { sql: string; values: unknown[] });
          return Promise.resolve([{ total: 1 }]);
        },
      ),
      order: delegate("order"),
      user: delegate("user"),
      product: delegate("product"),
      trade: delegate("trade"),
      commissionLedger: delegate("commissionLedger"),
      membershipPayment: delegate("membershipPayment"),
      productBoost: delegate("productBoost"),
      tradeCashPayment: delegate("tradeCashPayment"),
      payoutTransfer: delegate("payoutTransfer"),
      refundAttempt: delegate("refundAttempt"),
      orderPackage: delegate("orderPackage"),
    };
  }

  /** The where clauses of the three windows a metric's model was asked for. */
  const whereFor = (model: string) =>
    calls.filter((call) => call.model === model).map((call) => call.args.where);

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(now);
    calls = [];
    rawSqlCalls = [];
    prisma = recordingPrisma();
    cache = {
      // Cache miss on every read — the metric definitions are what is under test.
      getOrSet: jest.fn(async (_key: string, factory: () => Promise<unknown>) =>
        factory(),
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

    it("counts deliveries from Order.deliveredAt (shared by count and amount)", () => {
      const wheres = whereFor("order").filter(
        (where) => where && "deliveredAt" in where,
      );
      // deliveredOrders (count) + deliveredAmount (aggregate), 3 windows each
      expect(wheres).toHaveLength(6);
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

    it("reads net platform revenue from CommissionLedger.earnedAt", () => {
      // netRevenue, netRevenueCount, serviceFeeAmount and commissionAmount all
      // share the exact same (no-OR) `{earnedAt, status}` where — only the
      // `OR` (non-zero fee) count queries differ in shape. netRevenue is
      // FIRST in the catalogue, so its three windows are the first three here.
      const wheres = whereFor("commissionLedger").filter(
        (where) => where && "earnedAt" in where && !("OR" in where),
      );
      expect(wheres).toHaveLength(12);
      expect(wheres[0]).toMatchObject({ status: { not: "waived" } });
      expect(wheres[2]?.earnedAt).toEqual({ not: null });
    });

    it("reads boost revenue from ProductBoost.purchasedAt (shared by count and amount)", () => {
      const wheres = whereFor("productBoost").filter(
        (where) => where && "purchasedAt" in where,
      );
      expect(wheres).toHaveLength(6);
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

  describe("kullanıcılara ödenen hak ediş (PayoutTransfer)", () => {
    it("counts completed payouts from PayoutTransfer.processedAt", async () => {
      await service.getDashboardStats();

      const wheres = whereFor("payoutTransfer");
      expect(wheres).toHaveLength(3);
      expect(wheres[0]).toMatchObject({ status: "completed" });
      expect(wheres[2]?.processedAt).toEqual({ not: null });
    });

    it("reads the amount via raw SQL, once per window", async () => {
      await service.getDashboardStats();

      expect(prisma.$queryRaw).toHaveBeenCalledTimes(3);
      expect(rawSqlCalls).toHaveLength(3);
    });
  });

  describe("kullanıcılara ödenen İADE / İPTAL (RefundAttempt)", () => {
    it("excludes trade refunds and reads the finalize stamp", async () => {
      await service.getDashboardStats();

      const wheres = whereFor("refundAttempt");
      // returnRefundCount + returnRefundAmount + cancelRefundCount +
      // cancelRefundAmount, 3 windows each
      expect(wheres).toHaveLength(12);
      wheres.forEach((where) => {
        expect(where).toMatchObject({
          status: "finalized",
          orderId: { not: null },
        });
      });
      const allTime = wheres.filter(
        (where) => (where?.finalizedAt as any)?.not === null,
      );
      expect(allTime.length).toBeGreaterThan(0);
    });

    it("classifies by Order.deliveredAt: delivered → İADE, not delivered → İPTAL", async () => {
      await service.getDashboardStats();

      const wheres = whereFor("refundAttempt") as Array<Record<string, any>>;
      const returnWheres = wheres.filter(
        (where) => where.order?.is?.deliveredAt?.not === null,
      );
      const cancelWheres = wheres.filter(
        (where) => where.order?.is?.deliveredAt === null,
      );
      // Each classification is asked from two keys (count + amount), 3 windows.
      expect(returnWheres).toHaveLength(6);
      expect(cancelWheres).toHaveLength(6);
    });
  });

  describe("tamamlanan takas tutarı (TradeCashPayment, Trade.completedAt)", () => {
    it("nets from the trade's completion, not the payment's own paidAt", async () => {
      await service.getDashboardStats();

      const wheres = whereFor("tradeCashPayment") as Array<Record<string, any>>;
      const byTradeCompletion = wheres.filter((where) => where.trade);
      const byPaidAt = wheres.filter((where) => "paidAt" in where);

      // completedTradeAmount vs tradeFeeRevenue — two DIFFERENT event stamps,
      // both on the same model, 3 windows each.
      expect(byTradeCompletion).toHaveLength(3);
      expect(byPaidAt).toHaveLength(3);
      expect(byTradeCompletion[0]).toMatchObject({ status: "completed" });
      expect(byTradeCompletion[0].trade).toEqual({
        completedAt: { gte: todayStart, lte: now },
      });
    });
  });

  describe("kargo (OrderPackage) tekilleştirme", () => {
    it("counts packages, not orders — de-duplicated via `orders.some`", async () => {
      await service.getDashboardStats();

      const wheres = whereFor("orderPackage") as Array<Record<string, any>>;
      expect(wheres).toHaveLength(6); // count + amount, 3 windows
      wheres.forEach((where) => {
        expect(where.orders?.some).toBeDefined();
        // Same predicate as paidOrders: excludes virtual orders.
        expect(where.orders.some.origin).toEqual({ not: "platform_service" });
      });
    });
  });

  describe("üyelik ve öne çıkarma adedi paylaşır (aynı yüklem)", () => {
    it("membershipRevenue and membershipCount read the same where", async () => {
      await service.getDashboardStats();

      const wheres = whereFor("membershipPayment");
      expect(wheres).toHaveLength(6); // revenue + count, 3 windows
      wheres.forEach((where) =>
        expect(where).toMatchObject({ status: "completed" }),
      );
    });
  });

  describe("bileşen kırılımı matematiği (hizmet bedeli & komisyon)", () => {
    it("service fee amount nets refunds against the gross platform fee", async () => {
      const result = await service.getDashboardStats();

      // Fields requested in order: buyer(1) + seller(2) - refundedBuyer(3) -
      // refundedSeller(4) = -4. A plain sum (wrong formula) would give 10.
      expect(result.metrics.serviceFeeAmount.period).toBe(-4);
    });

    it("commission amount nets refunds against the gross commission", async () => {
      const result = await service.getDashboardStats();

      expect(result.metrics.commissionAmount.period).toBe(-4);
    });

    it("counts only ledger rows with a non-zero platform fee/commission", async () => {
      await service.getDashboardStats();

      const wheres = whereFor("commissionLedger") as Array<Record<string, any>>;
      const serviceFeeCountWheres = wheres.filter((where) =>
        where.OR?.some((clause: any) => "buyerPlatformFeeAmount" in clause),
      );
      const commissionCountWheres = wheres.filter((where) =>
        where.OR?.some((clause: any) => "buyerCommissionAmount" in clause),
      );
      expect(serviceFeeCountWheres).toHaveLength(3);
      expect(commissionCountWheres).toHaveLength(3);
    });
  });

  it("derives the trend from the preceding window of equal length", async () => {
    const result = await service.getDashboardStats();

    // Every stub answers the same value across windows, so period == previous.
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

    // v2: the response shape changed with this batch of finance metrics.
    expect(liveKey).toContain("admin:dashboard:period:v2:daily:");
    expect(liveOptions.ttl).toBe(
      AdminAnalyticsDashboardService.PERIOD_CACHE_TTL_SECONDS,
    );
    // A window that has already closed cannot gain rows — hold it far longer.
    expect(closedKey).toContain("admin:dashboard:period:v2:custom:");
    expect(closedOptions.ttl).toBe(
      AdminAnalyticsDashboardService.CLOSED_RANGE_CACHE_TTL_SECONDS,
    );
  });
});
