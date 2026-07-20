import {
  CommissionLedgerStatus,
  OrderCancellationType,
  OrderStatus,
  ProductStatus,
  RefundRequestStatus,
} from "@prisma/client";
import { AdminAnalyticsDashboardService } from "./admin-analytics-dashboard.service";

describe("AdminAnalyticsDashboardService dashboard periods", () => {
  const now = new Date(2026, 6, 20, 12, 30, 0);
  const yesterdayStart = new Date(2026, 6, 19);
  const todayStart = new Date(2026, 6, 20);
  const thisMonthStart = new Date(2026, 6, 1);
  const lastMonthStart = new Date(2026, 5, 1);

  let prisma: any;
  let service: AdminAnalyticsDashboardService;

  const valueForPeriod = (
    createdAt: { gte: Date },
    values: [number, number, number],
  ) => {
    const start = createdAt.gte.getTime();
    if (start === yesterdayStart.getTime()) return values[0];
    if (start === thisMonthStart.getTime()) return values[1];
    if (start === lastMonthStart.getTime()) return values[2];
    throw new Error(`Unexpected period start: ${createdAt.gte.toISOString()}`);
  };

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(now);

    prisma = {
      user: {
        count: jest.fn(async (args?: any) => {
          const where = args?.where;
          if (!where) return 100;
          if (where.isBanned === false) {
            return valueForPeriod(where.createdAt, [3, 20, 10]);
          }
          if (where.OR) return valueForPeriod(where.createdAt, [1, 4, 8]);
          if (where.createdAt.lt || where.createdAt.lte) {
            return valueForPeriod(where.createdAt, [4, 24, 12]);
          }
          return 7;
        }),
      },
      product: {
        count: jest.fn(async (args?: any) => {
          const where = args?.where;
          if (!where) return 80;
          if (!where.createdAt) {
            if (where.status === ProductStatus.active) return 40;
            if (where.status === ProductStatus.pending) return 10;
          }
          if (where.status === ProductStatus.active) {
            return valueForPeriod(where.createdAt, [2, 8, 5]);
          }
          if (where.status?.in) {
            return valueForPeriod(where.createdAt, [1, 4, 8]);
          }
          return valueForPeriod(where.createdAt, [3, 12, 13]);
        }),
        groupBy: jest
          .fn()
          .mockResolvedValue([{ categoryId: "category-1", _count: { id: 3 } }]),
      },
      order: {
        count: jest.fn(async (args?: any) => {
          const where = args?.where;
          if (!where) return 300;
          if (!where.createdAt && where.status === OrderStatus.completed)
            return 200;
          if (where.status === OrderStatus.cancelled) {
            return valueForPeriod(where.createdAt, [1, 6, 3]);
          }
          if (where.status?.in) {
            return valueForPeriod(where.createdAt, [1, 18, 12]);
          }
          if (where.createdAt.lt || where.createdAt.lte) {
            return valueForPeriod(where.createdAt, [2, 30, 20]);
          }
          return 15;
        }),
        aggregate: jest.fn(async (args: any) => {
          const createdAt = args.where.createdAt;
          if (!createdAt) return { _sum: { commissionAmount: 999 } };
          if (!createdAt.lt && !createdAt.lte) {
            return { _sum: { commissionAmount: 77 } };
          }
          if (args._sum.totalAmount) {
            return {
              _sum: {
                totalAmount: valueForPeriod(createdAt, [100, 3000, 2000]),
              },
            };
          }
          return {
            _sum: {
              commissionAmount: valueForPeriod(createdAt, [10, 200, 100]),
            },
          };
        }),
        groupBy: jest.fn(async (args: any) => {
          if (args.by[0] === "categoryId") return [];
          const period = valueForPeriod(args.where.createdAt, [0, 1, 2]);
          return [
            {
              cancellationType: OrderCancellationType.iptal,
              _count: { id: [1, 4, 2][period] },
            },
            {
              cancellationType: OrderCancellationType.iade,
              _count: { id: [0, 2, 1][period] },
            },
          ];
        }),
      },
      commissionLedger: {
        aggregate: jest.fn(async (args: any) => {
          const period = valueForPeriod(args.where.createdAt, [0, 1, 2]);
          return {
            _sum: {
              sellerCommission: [8, 100, 50][period],
              refundedSellerCommission: [1, 20, 10][period],
              buyerFee: [2, 10, 10][period],
              refundedBuyerFee: [0, 5, 0][period],
            },
          };
        }),
      },
      refundRequest: {
        count: jest.fn(async (args: any) =>
          valueForPeriod(args.where.createdAt, [1, 8, 4]),
        ),
        groupBy: jest.fn(async (args: any) => {
          const period = valueForPeriod(args.where.createdAt, [0, 1, 2]);
          return [
            {
              status: RefundRequestStatus.pending_review,
              _count: { id: [1, 3, 2][period] },
            },
            {
              status: RefundRequestStatus.refunded,
              _count: { id: [0, 5, 2][period] },
            },
          ];
        }),
      },
      category: {
        findMany: jest
          .fn()
          .mockResolvedValue([{ id: "category-1", name: "Collectibles" }]),
      },
    };

    service = new AdminAnalyticsDashboardService(prisma, {} as any);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("returns every dashboard metric with calendar period values", async () => {
    const result = await service.getDashboardStats();

    expect(result.users).toEqual({
      yesterday: 4,
      thisMonth: 24,
      lastMonth: 12,
      changePercent: 100,
      total: 100,
      new7d: 7,
    });
    expect(result.products).toMatchObject({
      yesterday: 3,
      thisMonth: 12,
      lastMonth: 13,
      changePercent: -7.69,
      total: 80,
      active: 40,
      pending: 10,
    });
    expect(result.orders).toMatchObject({
      yesterday: 2,
      thisMonth: 30,
      lastMonth: 20,
      changePercent: 50,
      total: 300,
      last7d: 15,
      completed: 200,
    });
    expect(result.commission).toEqual({
      yesterday: 10,
      thisMonth: 200,
      lastMonth: 100,
      changePercent: 100,
    });
    expect(result.totalSales).toEqual({
      yesterday: 1,
      thisMonth: 18,
      lastMonth: 12,
      changePercent: 50,
    });
    expect(result.grossSales).toEqual({
      yesterday: 100,
      thisMonth: 3000,
      lastMonth: 2000,
      changePercent: 50,
    });
    expect(result.netCommission).toEqual({
      yesterday: 9,
      thisMonth: 85,
      lastMonth: 50,
      changePercent: 70,
    });
    expect(result.activeProducts).toMatchObject({ thisMonth: 8, lastMonth: 5 });
    expect(result.passiveProducts).toMatchObject({
      thisMonth: 4,
      lastMonth: 8,
    });
    expect(result.activeUsers).toMatchObject({ thisMonth: 20, lastMonth: 10 });
    expect(result.passiveUsers).toMatchObject({ thisMonth: 4, lastMonth: 8 });
    expect(result.cancellations).toEqual({
      yesterday: 1,
      thisMonth: 6,
      lastMonth: 3,
      changePercent: 100,
    });
    expect(result.cancellationsByType.iptal).toMatchObject({
      yesterday: 1,
      thisMonth: 4,
      lastMonth: 2,
    });
    expect(result.cancellationsByType.iade).toMatchObject({
      yesterday: 0,
      thisMonth: 2,
      lastMonth: 1,
    });
    expect(result.refunds).toEqual({
      yesterday: 1,
      thisMonth: 8,
      lastMonth: 4,
      changePercent: 100,
    });
    expect(result.refundsByStatus.pending_review).toMatchObject({
      yesterday: 1,
      thisMonth: 3,
      lastMonth: 2,
    });
    expect(result.refundsByStatus.refunded).toMatchObject({
      yesterday: 0,
      thisMonth: 5,
      lastMonth: 2,
    });
  });

  it("uses the required state, realized-sale, and ledger filters", async () => {
    await service.getDashboardStats();

    expect(prisma.user.count).toHaveBeenCalledWith({
      where: {
        createdAt: expect.any(Object),
        isBanned: false,
        deletedAt: null,
      },
    });
    expect(prisma.user.count).toHaveBeenCalledWith({
      where: {
        createdAt: expect.any(Object),
        OR: [{ isBanned: true }, { deletedAt: { not: null } }],
      },
    });
    expect(prisma.product.count).toHaveBeenCalledWith({
      where: {
        createdAt: expect.any(Object),
        status: {
          in: [ProductStatus.inactive, ProductStatus.suspended],
        },
      },
    });

    const grossSalesCall = prisma.order.aggregate.mock.calls.find(
      ([args]: any[]) => args._sum.totalAmount,
    )[0];
    expect(grossSalesCall.where.status.in).toEqual([
      OrderStatus.paid,
      OrderStatus.delivered,
      OrderStatus.completed,
    ]);

    const ledgerCall = prisma.commissionLedger.aggregate.mock.calls[0][0];
    expect(ledgerCall.where.status).toEqual({
      not: CommissionLedgerStatus.waived,
    });
    expect(ledgerCall._sum).toEqual({
      sellerCommission: true,
      refundedSellerCommission: true,
      buyerFee: true,
      refundedBuyerFee: true,
    });

    const orderPeriodCalls = prisma.order.count.mock.calls
      .map(([args]: any[]) => args?.where?.createdAt)
      .filter((createdAt: any) => createdAt?.lt || createdAt?.lte);
    expect(orderPeriodCalls).toEqual(
      expect.arrayContaining([
        { gte: yesterdayStart, lt: todayStart },
        { gte: thisMonthStart, lte: now },
        { gte: lastMonthStart, lt: thisMonthStart },
      ]),
    );
  });
});
