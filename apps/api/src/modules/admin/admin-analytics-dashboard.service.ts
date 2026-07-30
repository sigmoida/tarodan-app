import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma";
import { AnalyticsQueryDto } from "./dto";
import {
  CommissionLedgerStatus,
  OrderCancellationType,
  OrderStatus,
  ProductStatus,
  RefundRequestStatus,
} from "@prisma/client";
import { AdminAnalyticsCommonService } from "./admin-analytics-common.service";
import { ledgerNetRevenue } from "../commission/ledger-net";

export interface MetricPeriods {
  yesterday: number;
  thisMonth: number;
  lastMonth: number;
  changePercent: number;
}

type MetricPeriodKey = "yesterday" | "thisMonth" | "lastMonth";
type PeriodRange = { gte: Date; lt?: Date; lte?: Date };
type PeriodRanges = Record<MetricPeriodKey, PeriodRange>;

const METRIC_PERIOD_KEYS: MetricPeriodKey[] = [
  "yesterday",
  "thisMonth",
  "lastMonth",
];

const REALIZED_ORDER_STATUSES: OrderStatus[] = [
  OrderStatus.paid,
  OrderStatus.delivered,
  OrderStatus.completed,
];

/**
 * Analitik & dashboard grubu (dashboard istatistikleri, snapshot, satış/gelir/
 * kullanıcı analitiği, komisyon geliri, son siparişler, bekleyen aksiyonlar) —
 * AdminAnalyticsService'ten birebir taşındı. AdminAnalyticsService ince alt-facade
 * olarak buraya delege eder. Tarih gruplama anahtarı (getDateKey) gruplar-arası
 * paylaşıldığı için AdminAnalyticsCommonService'te. Inject: prisma, common.
 */
@Injectable()
export class AdminAnalyticsDashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly common: AdminAnalyticsCommonService,
  ) {}

  // ==================== ANALYTICS & REPORTS ====================

  /**
   * Get dashboard statistics
   * Requirement: Reporting dashboards (project.md)
   */
  async getDashboardStats() {
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const periods = this.getPeriodRanges(now);

    const [
      users,
      products,
      orders,
      totalSales,
      commission,
      activeProductsByPeriod,
      passiveProducts,
      activeUsers,
      passiveUsers,
      grossSales,
      netCommission,
      cancellations,
      refunds,
      cancellationsGrouped,
      refundsGrouped,
      totalUsers,
      newUsers7d,
      totalProducts,
      activeProducts,
      pendingProducts,
      totalOrders,
      orders7d,
      completedOrders,
      totalRevenue,
      revenue7d,
      byCategory,
    ] = await Promise.all([
      this.getMetricPeriods(periods, (createdAt) =>
        this.prisma.user.count({ where: { createdAt } }),
      ),
      this.getMetricPeriods(periods, (createdAt) =>
        this.prisma.product.count({ where: { createdAt } }),
      ),
      this.getMetricPeriods(periods, (createdAt) =>
        this.prisma.order.count({ where: { createdAt } }),
      ),
      this.getMetricPeriods(periods, (createdAt) =>
        this.prisma.order.count({
          where: {
            createdAt,
            status: { in: REALIZED_ORDER_STATUSES },
          },
        }),
      ),
      this.getMetricPeriods(periods, async (createdAt) => {
        const result = await this.prisma.order.aggregate({
          _sum: { commissionAmount: true },
          where: {
            createdAt,
            status: { in: REALIZED_ORDER_STATUSES },
          },
        });
        return Number(result._sum.commissionAmount ?? 0);
      }),
      // Product/User models do not keep status history. These period values
      // therefore describe records created in the period that are currently in
      // the requested account/catalog state.
      this.getMetricPeriods(periods, (createdAt) =>
        this.prisma.product.count({
          where: { createdAt, status: ProductStatus.active },
        }),
      ),
      this.getMetricPeriods(periods, (createdAt) =>
        this.prisma.product.count({
          where: {
            createdAt,
            status: {
              in: [ProductStatus.inactive, ProductStatus.suspended],
            },
          },
        }),
      ),
      this.getMetricPeriods(periods, (createdAt) =>
        this.prisma.user.count({
          where: { createdAt, isBanned: false, deletedAt: null },
        }),
      ),
      this.getMetricPeriods(periods, (createdAt) =>
        this.prisma.user.count({
          where: {
            createdAt,
            OR: [{ isBanned: true }, { deletedAt: { not: null } }],
          },
        }),
      ),
      this.getMetricPeriods(periods, async (createdAt) => {
        const result = await this.prisma.order.aggregate({
          _sum: { totalAmount: true },
          where: {
            createdAt,
            status: { in: REALIZED_ORDER_STATUSES },
          },
        });
        return Number(result._sum.totalAmount ?? 0);
      }),
      this.getMetricPeriods(periods, async (createdAt) => {
        const result = await this.prisma.commissionLedger.aggregate({
          _sum: {
            sellerCommission: true,
            refundedSellerCommission: true,
            buyerFee: true,
            refundedBuyerFee: true,
          },
          where: {
            createdAt,
            status: { not: CommissionLedgerStatus.waived },
          },
        });
        // TEK formül (ledgerNetRevenue) — finans özetiyle aynı kaynak.
        // Withholding tax belongs to the seller's tax/payout flow and is not
        // platform revenue, so it does not reduce net commission here.
        return ledgerNetRevenue(result._sum);
      }),
      this.getMetricPeriods(periods, (createdAt) =>
        this.prisma.order.count({
          where: { createdAt, status: OrderStatus.cancelled },
        }),
      ),
      this.getMetricPeriods(periods, (createdAt) =>
        this.prisma.refundRequest.count({ where: { createdAt } }),
      ),
      Promise.all(
        METRIC_PERIOD_KEYS.map((period) =>
          this.prisma.order.groupBy({
            by: ["cancellationType"],
            where: {
              createdAt: periods[period],
              status: OrderStatus.cancelled,
            },
            _count: { id: true },
          }),
        ),
      ),
      Promise.all(
        METRIC_PERIOD_KEYS.map((period) =>
          this.prisma.refundRequest.groupBy({
            by: ["status"],
            where: { createdAt: periods[period] },
            _count: { id: true },
          }),
        ),
      ),
      this.prisma.user.count(),
      this.prisma.user.count({ where: { createdAt: { gte: sevenDaysAgo } } }),
      this.prisma.product.count(),
      this.prisma.product.count({ where: { status: ProductStatus.active } }),
      this.prisma.product.count({ where: { status: ProductStatus.pending } }),
      this.prisma.order.count(),
      this.prisma.order.count({ where: { createdAt: { gte: sevenDaysAgo } } }),
      this.prisma.order.count({ where: { status: OrderStatus.completed } }),
      this.prisma.order.aggregate({
        _sum: { commissionAmount: true },
        where: { status: { in: REALIZED_ORDER_STATUSES } },
      }),
      this.prisma.order.aggregate({
        _sum: { commissionAmount: true },
        where: {
          createdAt: { gte: sevenDaysAgo },
          status: { in: REALIZED_ORDER_STATUSES },
        },
      }),
      this.prisma.product.groupBy({
        by: ["categoryId"],
        _count: { id: true },
      }),
    ]);

    const categoryIds = [
      ...new Set(byCategory.map((c) => c.categoryId).filter(Boolean)),
    ] as string[];
    const categories =
      categoryIds.length > 0
        ? await this.prisma.category.findMany({
            where: { id: { in: categoryIds } },
            select: { id: true, name: true },
          })
        : [];
    const categoryMap = new Map(categories.map((c) => [c.id, c.name]));
    const categoryDistribution = byCategory
      .map((c) => ({
        name: c.categoryId
          ? categoryMap.get(c.categoryId) || "Kategorisiz"
          : "Kategorisiz",
        count: c._count.id,
      }))
      .sort((a, b) => b.count - a.count);

    const cancellationsByType = this.buildPeriodBreakdown(
      Object.values(OrderCancellationType),
      cancellationsGrouped,
      "cancellationType",
    );
    const refundsByStatus = this.buildPeriodBreakdown(
      Object.values(RefundRequestStatus),
      refundsGrouped,
      "status",
    );

    return {
      users: {
        ...users,
        total: totalUsers,
        new7d: newUsers7d,
      },
      products: {
        ...products,
        total: totalProducts,
        active: activeProducts,
        pending: pendingProducts,
      },
      orders: {
        ...orders,
        total: totalOrders,
        last7d: orders7d,
        completed: completedOrders,
      },
      revenue: {
        ...commission,
        total: Number(totalRevenue._sum.commissionAmount || 0),
        last7d: Number(revenue7d._sum.commissionAmount || 0),
      },
      totalSales,
      commission,
      activeProducts: activeProductsByPeriod,
      passiveProducts,
      activeUsers,
      passiveUsers,
      grossSales,
      netCommission,
      cancellations,
      cancellationsByType,
      refunds,
      refundsByStatus,
      categoryDistribution,
    };
  }

  private getPeriodRanges(now: Date): PeriodRanges {
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);

    return {
      yesterday: { gte: yesterday, lt: today },
      thisMonth: { gte: thisMonth, lte: now },
      lastMonth: { gte: lastMonth, lt: thisMonth },
    };
  }

  private async getMetricPeriods(
    periods: PeriodRanges,
    getValue: (range: PeriodRange) => Promise<number>,
  ): Promise<MetricPeriods> {
    const [yesterday, thisMonth, lastMonth] = await Promise.all(
      METRIC_PERIOD_KEYS.map((period) => getValue(periods[period])),
    );

    return this.createMetricPeriods(yesterday, thisMonth, lastMonth);
  }

  private createMetricPeriods(
    yesterday: number,
    thisMonth: number,
    lastMonth: number,
  ): MetricPeriods {
    const normalizedYesterday = this.roundMetric(yesterday);
    const normalizedThisMonth = this.roundMetric(thisMonth);
    const normalizedLastMonth = this.roundMetric(lastMonth);

    return {
      yesterday: normalizedYesterday,
      thisMonth: normalizedThisMonth,
      lastMonth: normalizedLastMonth,
      changePercent: this.calculateChangePercent(
        normalizedThisMonth,
        normalizedLastMonth,
      ),
    };
  }

  private calculateChangePercent(current: number, previous: number): number {
    if (previous === 0) return current === 0 ? 0 : 100;
    return this.roundMetric(((current - previous) / Math.abs(previous)) * 100);
  }

  private roundMetric(value: number): number {
    return Math.round(value * 100) / 100;
  }

  private buildPeriodBreakdown<T extends string>(
    values: T[],
    groupedPeriods: Array<
      Array<Record<string, unknown> & { _count: { id: number } }>
    >,
    field: string,
  ): Record<T, MetricPeriods> {
    const result = {} as Record<T, MetricPeriods>;

    values.forEach((value) => {
      const counts = groupedPeriods.map(
        (rows) => rows.find((row) => row[field] === value)?._count.id ?? 0,
      );
      result[value] = this.createMetricPeriods(counts[0], counts[1], counts[2]);
    });

    return result;
  }

  /**
   * Save analytics snapshot
   */
  async saveAnalyticsSnapshot() {
    const stats = await this.getDashboardStats();

    const snapshot = await this.prisma.analyticsSnapshot.create({
      data: {
        snapshotType: "daily",
        snapshotDate: new Date(),
        totalUsers: stats.users.total,
        totalProducts: stats.products.total,
        totalOrders: stats.orders.total,
        totalRevenue: stats.revenue.total,
        newUsers: stats.users.new7d,
        newOrders: stats.orders.last7d,
        data: stats as any,
      },
    });

    return snapshot;
  }

  /**
   * Get sales analytics with date range
   * Requirement: GET /admin/analytics/sales (7.2)
   */
  async getSalesAnalytics(query: AnalyticsQueryDto) {
    const endDateRaw = query.endDate ? new Date(query.endDate) : new Date();
    const endDate = new Date(endDateRaw);
    endDate.setHours(23, 59, 59, 999);
    const startDate = query.startDate
      ? new Date(query.startDate)
      : new Date(endDate.getTime() - 30 * 24 * 60 * 60 * 1000);
    startDate.setHours(0, 0, 0, 0);

    const completedStatuses = [
      OrderStatus.completed,
      OrderStatus.delivered,
      OrderStatus.paid,
    ] as const;
    const [orders, ordersByStatus] = await Promise.all([
      this.prisma.order.findMany({
        where: {
          createdAt: { gte: startDate, lte: endDate },
          status: { in: [...completedStatuses] },
        },
        select: {
          createdAt: true,
          totalAmount: true,
        },
        orderBy: { createdAt: "asc" },
      }),
      this.prisma.order.groupBy({
        by: ["status"],
        where: { createdAt: { gte: startDate, lte: endDate } },
        _count: { id: true },
      }),
    ]);

    const ordersByStatusMap: Record<string, number> = {};
    ordersByStatus.forEach((row) => {
      ordersByStatusMap[row.status] = row._count.id;
    });

    // Group by date (period data for charts and summary)
    const groupedData = new Map<
      string,
      { totalSales: number; orderCount: number }
    >();
    orders.forEach((order) => {
      const dateKey = this.common.getDateKey(order.createdAt, query.groupBy);
      const existing = groupedData.get(dateKey) || {
        totalSales: 0,
        orderCount: 0,
      };
      groupedData.set(dateKey, {
        totalSales: existing.totalSales + Number(order.totalAmount),
        orderCount: existing.orderCount + 1,
      });
    });

    const result = Array.from(groupedData.entries()).map(([date, data]) => ({
      date,
      totalSales: Math.round(data.totalSales * 100) / 100,
      orderCount: data.orderCount,
      averageOrderValue:
        data.orderCount > 0
          ? Math.round((data.totalSales / data.orderCount) * 100) / 100
          : 0,
    }));

    const periodTotalSales = result.reduce((sum, r) => sum + r.totalSales, 0);
    const periodTotalOrders = result.reduce((sum, r) => sum + r.orderCount, 0);
    const periodAvgOrderValue =
      periodTotalOrders > 0
        ? Math.round((periodTotalSales / periodTotalOrders) * 100) / 100
        : 0;

    return {
      data: result,
      summary: {
        totalSales: periodTotalSales,
        totalOrders: periodTotalOrders,
        averageOrderValue: periodAvgOrderValue,
        ordersByStatus: ordersByStatusMap,
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
      },
    };
  }

  /**
   * Get revenue analytics with date range
   * Requirement: GET /admin/analytics/revenue (7.2)
   */
  async getRevenueAnalytics(query: AnalyticsQueryDto) {
    const endDateRaw = query.endDate ? new Date(query.endDate) : new Date();
    const endDate = new Date(endDateRaw);
    endDate.setHours(23, 59, 59, 999);
    const startDate = query.startDate
      ? new Date(query.startDate)
      : new Date(endDate.getTime() - 30 * 24 * 60 * 60 * 1000);
    startDate.setHours(0, 0, 0, 0);

    const completedStatuses: OrderStatus[] = [
      OrderStatus.completed,
      OrderStatus.delivered,
      OrderStatus.paid,
    ];
    const orders = await this.prisma.order.findMany({
      where: {
        createdAt: { gte: startDate, lte: endDate },
      },
      select: {
        createdAt: true,
        totalAmount: true,
        commissionAmount: true,
        status: true,
      },
      orderBy: { createdAt: "asc" },
    });

    // Group by date
    const groupedData = new Map<
      string,
      { gross: number; commission: number; refunded: number }
    >();
    orders.forEach((order) => {
      const dateKey = this.common.getDateKey(order.createdAt, query.groupBy);
      const existing = groupedData.get(dateKey) || {
        gross: 0,
        commission: 0,
        refunded: 0,
      };
      const isRefunded = order.status === OrderStatus.refunded;
      const isCompleted = completedStatuses.includes(order.status);
      groupedData.set(dateKey, {
        gross: existing.gross + (isCompleted ? Number(order.totalAmount) : 0),
        commission:
          existing.commission +
          (isCompleted ? Number(order.commissionAmount) : 0),
        refunded:
          existing.refunded + (isRefunded ? Number(order.totalAmount) : 0),
      });
    });

    const result = Array.from(groupedData.entries()).map(([date, data]) => ({
      date,
      grossRevenue: Math.round(data.gross * 100) / 100,
      commissionRevenue: Math.round(data.commission * 100) / 100,
      netRevenue: Math.round((data.gross - data.refunded) * 100) / 100,
    }));

    const periodCommission = result.reduce(
      (sum, r) => sum + r.commissionRevenue,
      0,
    );

    return {
      data: result,
      summary: {
        totalGrossRevenue: result.reduce((sum, r) => sum + r.grossRevenue, 0),
        totalCommission: periodCommission,
        totalNetRevenue: result.reduce((sum, r) => sum + r.netRevenue, 0),
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
      },
    };
  }

  /**
   * Get user analytics with date range
   * Requirement: GET /admin/analytics/users (7.2)
   */
  async getUserAnalytics(query: AnalyticsQueryDto) {
    const endDateRaw = query.endDate ? new Date(query.endDate) : new Date();
    const endDate = new Date(endDateRaw);
    endDate.setHours(23, 59, 59, 999);
    const startDate = query.startDate
      ? new Date(query.startDate)
      : new Date(endDate.getTime() - 30 * 24 * 60 * 60 * 1000);
    startDate.setHours(0, 0, 0, 0);

    const [users, totalUsers, totalSellers] = await Promise.all([
      this.prisma.user.findMany({
        where: {
          createdAt: { gte: startDate, lte: endDate },
        },
        select: {
          createdAt: true,
          isSeller: true,
        },
        orderBy: { createdAt: "asc" },
      }),
      this.prisma.user.count(),
      this.prisma.user.count({ where: { isSeller: true } }),
    ]);

    // Get active users (those who placed orders or listed products in the period)
    const [activeOrderUsers, activeSellerUsers] = await Promise.all([
      this.prisma.order.findMany({
        where: { createdAt: { gte: startDate, lte: endDate } },
        select: { buyerId: true, createdAt: true },
        distinct: ["buyerId"],
      }),
      this.prisma.product.findMany({
        where: { createdAt: { gte: startDate, lte: endDate } },
        select: { sellerId: true, createdAt: true },
        distinct: ["sellerId"],
      }),
    ]);

    // Group new users by date
    const groupedData = new Map<
      string,
      { newUsers: number; newSellers: number; activeUsers: Set<string> }
    >();

    users.forEach((user) => {
      const dateKey = this.common.getDateKey(user.createdAt, query.groupBy);
      const existing = groupedData.get(dateKey) || {
        newUsers: 0,
        newSellers: 0,
        activeUsers: new Set(),
      };
      groupedData.set(dateKey, {
        newUsers: existing.newUsers + 1,
        newSellers: existing.newSellers + (user.isSeller ? 1 : 0),
        activeUsers: existing.activeUsers,
      });
    });

    // Add active users to their respective date groups
    [...activeOrderUsers, ...activeSellerUsers].forEach((item) => {
      const dateKey = this.common.getDateKey(item.createdAt, query.groupBy);
      const existing = groupedData.get(dateKey);
      if (existing) {
        const userId = "buyerId" in item ? item.buyerId : item.sellerId;
        existing.activeUsers.add(userId);
      }
    });

    const result = Array.from(groupedData.entries()).map(([date, data]) => ({
      date,
      newUsers: data.newUsers,
      activeUsers: data.activeUsers.size,
      newSellers: data.newSellers,
    }));

    return {
      data: result,
      summary: {
        totalUsers,
        totalNewUsers: result.reduce((sum, r) => sum + r.newUsers, 0),
        totalNewSellers: result.reduce((sum, r) => sum + r.newSellers, 0),
        totalSellers,
        averageDailyActiveUsers:
          result.length > 0
            ? Math.round(
                result.reduce((sum, r) => sum + r.activeUsers, 0) /
                  result.length,
              )
            : 0,
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
      },
    };
  }

  /**
   * Get recent orders for dashboard
   * Requirement: Recent Orders Panel (7.1)
   */
  async getRecentOrders(limit: number = 10) {
    const orders = await this.prisma.order.findMany({
      take: limit,
      orderBy: { createdAt: "desc" },
      include: {
        buyer: { select: { id: true, displayName: true } },
        product: { select: { id: true, title: true } },
      },
    });

    return orders.map((o) => ({
      id: o.id,
      orderNumber: o.orderNumber,
      buyerName: o.buyer.displayName,
      productTitle: o.product.title,
      amount: Number(o.totalAmount),
      status: o.status,
      createdAt: o.createdAt,
    }));
  }

  /**
   * Get top-N most-viewed products for the dashboard widget.
   * Ordered by viewCount desc; returns display fields consumed by the admin table
   * (id, title, thumbnail, viewCount, seller name, status, price).
   */
  async getTopProducts(limit: number = 10) {
    const products = await this.prisma.product.findMany({
      take: limit,
      orderBy: [{ viewCount: "desc" }, { createdAt: "desc" }],
      select: {
        id: true,
        title: true,
        viewCount: true,
        status: true,
        price: true,
        seller: { select: { id: true, displayName: true } },
        images: {
          orderBy: { sortOrder: "asc" },
          take: 1,
          select: { cardKey: true },
        },
      },
    });

    return products.map((p) => ({
      id: p.id,
      title: p.title,
      thumbnail: this.common.resolveProductImageUrl(p.images[0]?.cardKey),
      viewCount: p.viewCount,
      sellerId: p.seller.id,
      sellerName: p.seller.displayName,
      status: p.status,
      price: Number(p.price),
    }));
  }

  /**
   * Get top-N most-viewed sellers for the dashboard widget.
   * Ordered by storeViewCount desc across seller accounts (excluding banned
   * and deleted); returns display fields the admin table shows: id, name,
   * avatar, storeViewCount, product count, and active listings count.
   */
  async getTopSellers(limit: number = 10) {
    const sellers = await this.prisma.user.findMany({
      take: limit,
      where: { isSeller: true, isBanned: false, deletedAt: null },
      orderBy: [{ storeViewCount: "desc" }, { createdAt: "asc" }],
      select: {
        id: true,
        displayName: true,
        avatarUrl: true,
        storeViewCount: true,
        _count: { select: { products: true } },
      },
    });

    const sellerIds = sellers.map((s) => s.id);
    const activeCounts = sellerIds.length
      ? await this.prisma.product.groupBy({
          by: ["sellerId"],
          where: {
            sellerId: { in: sellerIds },
            status: ProductStatus.active,
          },
          _count: { id: true },
        })
      : [];
    const activeMap = new Map(
      activeCounts.map((row) => [row.sellerId, row._count.id]),
    );

    return sellers.map((s) => ({
      id: s.id,
      displayName: s.displayName,
      avatarUrl: this.common.resolveProductImageUrl(s.avatarUrl),
      storeViewCount: s.storeViewCount,
      productCount: s._count.products,
      activeListings: activeMap.get(s.id) ?? 0,
    }));
  }

  /**
   * Get pending actions for dashboard
   * Requirement: Pending Actions Panel (7.1)
   */
  async getPendingActions() {
    const [pendingProducts, refundRequests, pendingMessages] =
      await Promise.all([
        this.prisma.product.count({ where: { status: ProductStatus.pending } }),
        this.prisma.order.count({
          where: { status: OrderStatus.refund_requested },
        }),
        this.prisma.message.count({ where: { status: "pending_approval" } }),
      ]);

    return {
      pendingProducts,
      refundRequests,
      pendingMessages,
      totalPending: pendingProducts + refundRequests + pendingMessages,
    };
  }

  /**
   * Get commission revenue summary
   * Requirement: GET /admin/commission/revenue (project.txt)
   */
  async getCommissionRevenue(query: AnalyticsQueryDto) {
    const endDate = query.endDate ? new Date(query.endDate) : new Date();
    const startDate = query.startDate
      ? new Date(query.startDate)
      : new Date(endDate.getTime() - 30 * 24 * 60 * 60 * 1000);

    const [
      totalCommission,
      totalFees,
      commissionByMonth,
      commissionByCategory,
    ] = await Promise.all([
      // Total commission in period
      this.prisma.order.aggregate({
        _sum: { commissionAmount: true },
        where: {
          createdAt: { gte: startDate, lte: endDate },
          status: { in: [OrderStatus.completed, OrderStatus.delivered] },
        },
      }),
      // Buyer/seller fee breakdown
      this.prisma.order.aggregate({
        _sum: { buyerFeeAmount: true, sellerFeeAmount: true },
        where: {
          createdAt: { gte: startDate, lte: endDate },
          status: { in: [OrderStatus.completed, OrderStatus.delivered] },
        },
      }),
      // Commission grouped by month
      this.prisma.$queryRaw`
        SELECT 
          DATE_TRUNC('month', created_at) as month,
          SUM(commission_amount) as total
        FROM orders
        WHERE created_at >= ${startDate} 
          AND created_at <= ${endDate}
          AND status IN ('completed', 'delivered')
        GROUP BY DATE_TRUNC('month', created_at)
        ORDER BY month DESC
      ` as Promise<Array<{ month: Date; total: number }>>,
      // Commission by category
      this.prisma.order.findMany({
        where: {
          createdAt: { gte: startDate, lte: endDate },
          status: { in: [OrderStatus.completed, OrderStatus.delivered] },
        },
        include: {
          product: {
            select: {
              category: { select: { id: true, name: true } },
            },
          },
        },
      }),
    ]);

    // Group commission by category
    const categoryMap = new Map<
      string,
      { name: string; commission: number; count: number }
    >();
    commissionByCategory.forEach((order) => {
      const catId = order.product.category?.id || "uncategorized";
      const catName = order.product.category?.name || "Kategorisiz";
      const existing = categoryMap.get(catId) || {
        name: catName,
        commission: 0,
        count: 0,
      };
      categoryMap.set(catId, {
        name: catName,
        commission: existing.commission + Number(order.commissionAmount),
        count: existing.count + 1,
      });
    });

    return {
      totalCommission: Number(totalCommission._sum.commissionAmount || 0),
      totalBuyerFee: Number(totalFees._sum.buyerFeeAmount || 0),
      totalSellerFee: Number(totalFees._sum.sellerFeeAmount || 0),
      byMonth: commissionByMonth.map((m) => ({
        month: m.month,
        total: Number(m.total || 0),
      })),
      byCategory: Array.from(categoryMap.entries())
        .map(([id, data]) => ({
          categoryId: id,
          categoryName: data.name,
          commission: Math.round(data.commission * 100) / 100,
          orderCount: data.count,
        }))
        .sort((a, b) => b.commission - a.commission),
      period: {
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
      },
    };
  }
}
