import { OrderStatus, ProductStatus } from "@prisma/client";
import { DASHBOARD_METRIC_KEYS } from "@tarodan/types";
import { AdminAnalyticsDashboardService } from "./admin-analytics-dashboard.service";

/**
 * The dashboard's contract: every metric answers the selected period, the
 * preceding window and all-time from ONE definition, in ONE `$transaction`.
 */
describe("AdminAnalyticsDashboardService.getDashboardStats", () => {
  const now = new Date(2026, 6, 20, 12, 0, 0);
  const todayStart = new Date(2026, 6, 20);
  const monthStart = new Date(2026, 6, 1);

  type Window = "period" | "previous" | "allTime";

  /** Values every metric reports, per window — distinct so mix-ups show up. */
  const VALUES: Record<string, Record<Window, number>> = {
    orders: { period: 5, previous: 4, allTime: 300 },
    grossSales: { period: 1000, previous: 500, allTime: 90000 },
    commissionRevenue: { period: 100, previous: 50, allTime: 9000 },
    netCommission: { period: 80, previous: 40, allTime: 7000 },
    activeProducts: { period: 3, previous: 1, allTime: 472 },
    passiveProducts: { period: 2, previous: 2, allTime: 18 },
    activeUsers: { period: 10, previous: 8, allTime: 680 },
    passiveUsers: { period: 1, previous: 0, allTime: 12 },
    cancellations: { period: 2, previous: 1, allTime: 30 },
    refunds: { period: 1, previous: 2, allTime: 25 },
    visitors: { period: 7, previous: 9, allTime: 640 },
  };

  let prisma: any;
  let service: AdminAnalyticsDashboardService;
  /** Range starts each metric was asked for, keyed by metric. */
  let asked: Record<string, Array<Date | undefined>>;

  // The service builds its queries per metric in a fixed order — selected
  // period, preceding window, all-time — so the call index is the window.
  const WINDOW_ORDER: Window[] = ["period", "previous", "allTime"];

  const record = (metric: string, range: { gte?: Date } | undefined) => {
    const calls = (asked[metric] ??= []);
    const window = WINDOW_ORDER[calls.length];
    calls.push(range?.gte);
    return VALUES[metric][window];
  };

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(now);
    asked = {};

    prisma = {
      $transaction: jest.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
      user: {
        count: jest.fn(async (args: any) => {
          const where = args.where;
          if ("lastActivityAt" in where) {
            const range = where.lastActivityAt;
            return record(
              "visitors",
              range && "gte" in range ? range : undefined,
            );
          }
          if (where.isBanned === false)
            return record("activeUsers", where.createdAt);
          return record("passiveUsers", where.createdAt);
        }),
      },
      product: {
        count: jest.fn(async (args: any) => {
          const where = args.where;
          return where.status === ProductStatus.active
            ? record("activeProducts", where.createdAt)
            : record("passiveProducts", where.createdAt);
        }),
      },
      order: {
        count: jest.fn(async (args: any) => {
          const where = args.where;
          return where.status === OrderStatus.cancelled
            ? record("cancellations", where.createdAt)
            : record("orders", where.createdAt);
        }),
        aggregate: jest.fn(async (args: any) => {
          if (args._sum.totalAmount) {
            return {
              _sum: { totalAmount: record("grossSales", args.where.createdAt) },
            };
          }
          return {
            _sum: {
              commissionAmount: record(
                "commissionRevenue",
                args.where.createdAt,
              ),
            },
          };
        }),
      },
      commissionLedger: {
        aggregate: jest.fn(async (args: any) => ({
          _sum: {
            sellerCommission: record("netCommission", args.where.createdAt),
            refundedSellerCommission: 0,
            buyerFee: 0,
            refundedBuyerFee: 0,
          },
        })),
      },
      refundRequest: {
        count: jest.fn(async (args: any) =>
          record("refunds", args.where.createdAt),
        ),
      },
    };

    service = new AdminAnalyticsDashboardService(prisma, {} as any);
  });

  afterEach(() => jest.useRealTimers());

  it("returns every metric with its period, previous and all-time figure", async () => {
    const result = await service.getDashboardStats();

    expect(Object.keys(result.metrics).sort()).toEqual(
      [...DASHBOARD_METRIC_KEYS].sort(),
    );
    for (const key of DASHBOARD_METRIC_KEYS) {
      expect(result.metrics[key]).toMatchObject({
        period: VALUES[key].period,
        previous: VALUES[key].previous,
        allTime: VALUES[key].allTime,
      });
    }
  });

  it("asks every metric for all three windows from one definition", async () => {
    await service.getDashboardStats();

    for (const key of DASHBOARD_METRIC_KEYS) {
      expect(asked[key]).toHaveLength(3);
      // third call is all-time → no date filter at all
      expect(asked[key][2]).toBeUndefined();
    }
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.$transaction.mock.calls[0][0]).toHaveLength(
      DASHBOARD_METRIC_KEYS.length * 3,
    );
  });

  it("defaults to today and echoes the measured window", async () => {
    const result = await service.getDashboardStats();

    expect(result.range.type).toBe("daily");
    expect(result.range.from).toBe(todayStart.toISOString());
    expect(result.range.to).toBe(now.toISOString());
    expect(asked.orders[0]).toEqual(todayStart);
  });

  it("measures the month to date when asked for the monthly period", async () => {
    const result = await service.getDashboardStats({ period: "monthly" });

    expect(result.range.from).toBe(monthStart.toISOString());
    expect(asked.orders[0]).toEqual(monthStart);
    // all-time is unaffected by the selected period
    expect(result.metrics.orders.allTime).toBe(VALUES.orders.allTime);
  });

  it("measures a custom range and keeps the all-time figure", async () => {
    const result = await service.getDashboardStats({
      period: "custom",
      from: "2026-07-10",
      to: "2026-07-12",
    });

    expect(result.range.from).toBe(new Date(2026, 6, 10).toISOString());
    expect(result.range.to).toBe(
      new Date(2026, 6, 12, 23, 59, 59, 999).toISOString(),
    );
    expect(result.metrics.activeUsers.allTime).toBe(680);
  });

  it("derives the trend from the preceding window", async () => {
    const result = await service.getDashboardStats();

    // orders: 5 vs 4 → +25%, refunds: 1 vs 2 → -50%
    expect(result.metrics.orders.changePercent).toBe(25);
    expect(result.metrics.refunds.changePercent).toBe(-50);
  });

  it("counts visitors by last activity, with all-time meaning 'ever active'", async () => {
    await service.getDashboardStats();

    const calls = prisma.user.count.mock.calls
      .map((call: any[]) => call[0].where)
      .filter((where: any) => "lastActivityAt" in where);
    expect(calls).toHaveLength(3);
    expect(calls[2].lastActivityAt).toEqual({ not: null });
  });
});
