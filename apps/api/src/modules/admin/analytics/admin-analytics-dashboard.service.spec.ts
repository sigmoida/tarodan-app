import { DASHBOARD_METRIC_KEYS } from "@tarodan/types";
import { AdminAnalyticsDashboardService } from "./admin-analytics-dashboard.service";
import {
  istanbulDayEnd,
  istanbulDayStart,
} from "../../../common/helpers/tr-calendar";

interface RecordedCall {
  model: string;
  method: string;
  args: { where?: Record<string, unknown>; _sum?: Record<string, boolean> };
}

/**
 * Zone C's contract: every metric answers the selected period plus THREE
 * fixed figures (dün, bu ay, tüm zamanlar) from ONE definition — four windows
 * total — each one measuring an EVENT stamp rather than `status + createdAt`.
 * The period and the fixed trio are cached, and therefore recomputed,
 * SEPARATELY, so flipping the period filter never re-reads dün/bu ay/tüm
 * zamanlar.
 */
describe("AdminAnalyticsDashboardService.getDashboardStats", () => {
  // Explicit UTC instant, Istanbul noon on 20 Jul 2026 (UTC+3) — every
  // boundary below is derived from the SAME Istanbul calendar helpers the
  // service itself uses, never from process-local `Date` arithmetic, so the
  // suite passes under any `TZ` the test runner happens to use.
  const now = new Date("2026-07-20T09:00:00.000Z");
  const todayStart = istanbulDayStart("2026-07-20");
  const monthStart = istanbulDayStart("2026-07-01");
  const yesterdayStart = istanbulDayStart("2026-07-19");

  let calls: RecordedCall[];
  let rawSqlCalls: Array<{ sql: string; values: unknown[] }>;
  let prisma: any;
  let cache: any;
  let cacheStore: Map<string, unknown>;
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

  /** The where clauses of every window a metric's model was asked for. */
  const whereFor = (model: string) =>
    calls
      .filter((call) => call.model === model && call.method !== "$queryRaw")
      .map((call) => call.args.where);

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(now);
    calls = [];
    rawSqlCalls = [];
    prisma = recordingPrisma();
    cacheStore = new Map();
    cache = {
      // A real-ish cache (not a permanent miss): lets the "no recompute on
      // filter change" tests observe the fixed trio being served from cache.
      getOrSet: jest.fn(
        async (key: string, factory: () => Promise<unknown>) => {
          if (cacheStore.has(key)) return cacheStore.get(key);
          const value = await factory();
          cacheStore.set(key, value);
          return value;
        },
      ),
      del: jest.fn(),
      delPattern: jest.fn(),
    };
    service = new AdminAnalyticsDashboardService(prisma, {} as any, cache);
  });

  afterEach(() => jest.useRealTimers());

  it("returns every catalogued metric with period, dün, bu ay and tüm zamanlar", async () => {
    const result = await service.getDashboardStats();

    expect(Object.keys(result.metrics).sort()).toEqual(
      [...DASHBOARD_METRIC_KEYS].sort(),
    );
    for (const key of DASHBOARD_METRIC_KEYS) {
      expect(result.metrics[key]).toMatchObject({
        period: expect.any(Number),
        yesterday: expect.any(Number),
        thisMonth: expect.any(Number),
        allTime: expect.any(Number),
      });
      // The old trend fields must be gone, not just unused.
      expect(result.metrics[key]).not.toHaveProperty("previous");
      expect(result.metrics[key]).not.toHaveProperty("changePercent");
    }
  });

  it("reads the period and the fixed trio in three separate transactions", async () => {
    await service.getDashboardStats();

    // period (1 window) + closed fixed (dün+tüm zamanlar, 1 window) + bu ay
    // (1 window) = 3 transactions, never one shared transaction.
    expect(prisma.$transaction).toHaveBeenCalledTimes(3);
    expect(calls).toHaveLength(DASHBOARD_METRIC_KEYS.length * 4);
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
    expect(
      cancelled.some(
        (w) =>
          (w?.cancelledAt as any)?.gte?.getTime() === monthStart.getTime() &&
          (w?.cancelledAt as any)?.lte?.getTime() === now.getTime(),
      ),
    ).toBe(true);
  });

  it("measures a custom range inclusively at both ends, Istanbul bounds", async () => {
    const result = await service.getDashboardStats({
      period: "custom",
      from: "2026-07-10",
      to: "2026-07-12",
    });

    expect(result.range.from).toBe(
      istanbulDayStart("2026-07-10").toISOString(),
    );
    expect(result.range.to).toBe(istanbulDayEnd("2026-07-12").toISOString());
  });

  describe("measures event stamps, never `status + createdAt`", () => {
    const stampFor = (model: string, field: string) => () => {
      const wheres = whereFor(model).filter((where) => where && field in where);
      expect(wheres).toHaveLength(4); // period + dün + tüm zamanlar + bu ay
      return wheres;
    };

    beforeEach(async () => {
      await service.getDashboardStats();
    });

    it("counts cancellations from Order.cancelledAt", () => {
      const wheres = stampFor("order", "cancelledAt")();
      expect(
        wheres.some(
          (w) =>
            (w?.cancelledAt as any)?.gte?.getTime() === todayStart.getTime(),
        ),
      ).toBe(true);
      // all-time still measures the EVENT, it just drops the range
      expect(wheres.some((w) => (w?.cancelledAt as any)?.not === null)).toBe(
        true,
      );
    });

    it("counts deliveries from Order.deliveredAt (shared by count and amount)", () => {
      const wheres = whereFor("order").filter(
        (where) => where && "deliveredAt" in where,
      );
      // deliveredOrders (count) + deliveredAmount (aggregate), 4 windows each
      expect(wheres).toHaveLength(8);
      expect(wheres.some((w) => (w?.deliveredAt as any)?.not === null)).toBe(
        true,
      );
    });

    it("counts completed trades from Trade.completedAt", () => {
      stampFor("trade", "completedAt")();
    });

    it("counts new listings from Product.publishedAt", () => {
      stampFor("product", "publishedAt")();
    });

    it("reads net platform revenue from CommissionLedger.earnedAt", () => {
      // netRevenue, netRevenueCount, serviceFeeAmount and commissionAmount all
      // share the exact same (no-OR) `{earnedAt, status}` where — only the
      // `OR` (non-zero fee) count queries differ in shape. 4 metrics x 4
      // windows.
      const wheres = whereFor("commissionLedger").filter(
        (where) => where && "earnedAt" in where && !("OR" in where),
      );
      expect(wheres).toHaveLength(16);
      expect(wheres[0]).toMatchObject({ status: { not: "waived" } });
      expect(wheres.some((w) => (w?.earnedAt as any)?.not === null)).toBe(true);
    });

    it("reads boost revenue from ProductBoost.purchasedAt (shared by count and amount)", () => {
      const wheres = whereFor("productBoost").filter(
        (where) => where && "purchasedAt" in where,
      );
      expect(wheres).toHaveLength(8);
      expect(wheres.some((w) => (w?.purchasedAt as any)?.not === null)).toBe(
        true,
      );
    });

    it("counts a paid order through either its own or its group's payment", () => {
      const paid = whereFor("order").filter((where) => where && "OR" in where);
      expect(paid).toHaveLength(8); // adet + tutar, dört pencere
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
      expect(wheres).toHaveLength(4);
      wheres.forEach((where) =>
        expect(where).toMatchObject({ status: "completed" }),
      );
      expect(wheres.some((w) => (w?.processedAt as any)?.not === null)).toBe(
        true,
      );
    });

    it("reads the amount via raw SQL, once per window", async () => {
      await service.getDashboardStats();

      expect(prisma.$queryRaw).toHaveBeenCalledTimes(4);
      expect(rawSqlCalls).toHaveLength(4);
    });
  });

  describe("kullanıcılara ödenen İADE / İPTAL (RefundAttempt)", () => {
    it("excludes trade refunds and reads the finalize stamp", async () => {
      await service.getDashboardStats();

      const wheres = whereFor("refundAttempt");
      // returnRefundCount + returnRefundAmount + cancelRefundCount +
      // cancelRefundAmount, 4 windows each
      expect(wheres).toHaveLength(16);
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
      // Each classification is asked from two keys (count + amount), 4 windows.
      expect(returnWheres).toHaveLength(8);
      expect(cancelWheres).toHaveLength(8);
    });
  });

  describe("tamamlanan takas tutarı (TradeCashPayment, Trade.completedAt)", () => {
    it("nets from the trade's completion, not the payment's own paidAt", async () => {
      await service.getDashboardStats();

      const wheres = whereFor("tradeCashPayment") as Array<Record<string, any>>;
      // İki metrik de takasın şeridini süzer (`trade.isTest`); ayrım damgada:
      // tamamlanan tutar takasın `completedAt`inden, ücret ödemenin `paidAt`inden.
      const byTradeCompletion = wheres.filter(
        (where) => where.trade && "completedAt" in where.trade,
      );
      const byPaidAt = wheres.filter((where) => "paidAt" in where);

      // completedTradeAmount vs tradeFeeRevenue — two DIFFERENT event stamps,
      // both on the same model, 4 windows each.
      expect(byTradeCompletion).toHaveLength(4);
      expect(byPaidAt).toHaveLength(4);
      expect(byTradeCompletion[0]).toMatchObject({ status: "completed" });
      expect(byPaidAt.every((w) => !("completedAt" in (w.trade ?? {})))).toBe(
        true,
      );
      wheres.forEach((where) => expect(where.trade.isTest).toBe(false));
      expect(
        byTradeCompletion.some(
          (w) => w.trade?.completedAt?.gte?.getTime() === todayStart.getTime(),
        ),
      ).toBe(true);
    });
  });

  describe("kargo (OrderPackage) tekilleştirme", () => {
    it("counts packages, not orders — de-duplicated via `orders.some`", async () => {
      await service.getDashboardStats();

      const wheres = whereFor("orderPackage") as Array<Record<string, any>>;
      expect(wheres).toHaveLength(8); // count + amount, 4 windows
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
      expect(wheres).toHaveLength(8); // revenue + count, 4 windows
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
      expect(result.metrics.serviceFeeAmount.yesterday).toBe(-4);
      expect(result.metrics.serviceFeeAmount.thisMonth).toBe(-4);
      expect(result.metrics.serviceFeeAmount.allTime).toBe(-4);
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
      expect(serviceFeeCountWheres).toHaveLength(4);
      expect(commissionCountWheres).toHaveLength(4);
    });
  });

  describe("changing the period filter", () => {
    it("recomputes the period figure but NOT the fixed trio", async () => {
      await service.getDashboardStats({ period: "daily" });
      const transactionsAfterFirst = prisma.$transaction.mock.calls.length;

      await service.getDashboardStats({ period: "monthly" });

      // Only one more transaction — the new period's window. The fixed
      // trio's two transactions (closed + bu ay) are served from cache.
      expect(prisma.$transaction.mock.calls.length).toBe(
        transactionsAfterFirst + 1,
      );
    });

    it("keeps dün/bu ay/tüm zamanlar identical across period changes", async () => {
      const daily = await service.getDashboardStats({ period: "daily" });
      const monthly = await service.getDashboardStats({ period: "monthly" });

      expect(monthly.metrics.paidOrders.yesterday).toBe(
        daily.metrics.paidOrders.yesterday,
      );
      expect(monthly.metrics.paidOrders.thisMonth).toBe(
        daily.metrics.paidOrders.thisMonth,
      );
      expect(monthly.metrics.paidOrders.allTime).toBe(
        daily.metrics.paidOrders.allTime,
      );
    });
  });

  describe("dün — tam takvim günü, İstanbul", () => {
    it("measures Order.cancelledAt against the full Istanbul day before today", async () => {
      await service.getDashboardStats();

      const wheres = whereFor("order").filter(
        (where) => where?.cancelledAt && typeof where.cancelledAt === "object",
      ) as Array<{ cancelledAt: { gte?: Date; lte?: Date } }>;
      const yesterdayWhere = wheres.find(
        (w) => w.cancelledAt?.gte?.getTime() === yesterdayStart.getTime(),
      );
      expect(yesterdayWhere).toBeDefined();
      expect(yesterdayWhere?.cancelledAt.lte).toEqual(
        new Date(todayStart.getTime() - 1),
      );
    });
  });

  it("caches a live period under a bucketed key and a closed range under its own", async () => {
    await service.getDashboardStats();
    await service.getDashboardStats({
      period: "custom",
      from: "2026-07-01",
      to: "2026-07-02",
    });

    const periodKeys = cache.getOrSet.mock.calls
      .map((call: unknown[]) => call[0] as string)
      .filter((key: string) => key.startsWith("admin:dashboard:period:"));
    const [liveKey, customKey] = periodKeys;
    const liveOptions = cache.getOrSet.mock.calls.find(
      (call: unknown[]) => call[0] === liveKey,
    )?.[2];
    const customOptions = cache.getOrSet.mock.calls.find(
      (call: unknown[]) => call[0] === customKey,
    )?.[2];

    expect(liveKey).toContain("admin:dashboard:period:v4:daily:");
    expect(liveOptions.ttl).toBe(
      AdminAnalyticsDashboardService.PERIOD_CACHE_TTL_SECONDS,
    );
    // A window that has already closed cannot gain rows — hold it far longer.
    expect(customKey).toContain("admin:dashboard:period:v4:custom:");
    expect(customOptions.ttl).toBe(
      AdminAnalyticsDashboardService.CLOSED_RANGE_CACHE_TTL_SECONDS,
    );
  });

  it("keys the fixed trio by the Istanbul calendar date, separately from the period", async () => {
    await service.getDashboardStats();

    const fixedKeys = cache.getOrSet.mock.calls
      .map((call: unknown[]) => call[0] as string)
      .filter((key: string) => key.startsWith("admin:dashboard:fixed:"));

    expect(fixedKeys.some((k: string) => k.includes(":closed:"))).toBe(true);
    expect(fixedKeys.some((k: string) => k.includes(":month:"))).toBe(true);
    fixedKeys.forEach((key: string) => expect(key).toContain("2026-07-20"));

    const closedOptions = cache.getOrSet.mock.calls.find((call: unknown[]) =>
      (call[0] as string).includes(":closed:"),
    )?.[2];
    const monthOptions = cache.getOrSet.mock.calls.find((call: unknown[]) =>
      (call[0] as string).includes(":month:"),
    )?.[2];
    expect(closedOptions.ttl).toBe(
      AdminAnalyticsDashboardService.CLOSED_RANGE_CACHE_TTL_SECONDS,
    );
    expect(monthOptions.ttl).toBe(
      AdminAnalyticsDashboardService.PERIOD_CACHE_TTL_SECONDS,
    );
  });

  it("invalidatePeriodCache clears both the period and the fixed-trio patterns", async () => {
    await service.invalidatePeriodCache();

    expect(cache.delPattern).toHaveBeenCalledWith("admin:dashboard:period:*");
    expect(cache.delPattern).toHaveBeenCalledWith("admin:dashboard:fixed:*");
  });
});
