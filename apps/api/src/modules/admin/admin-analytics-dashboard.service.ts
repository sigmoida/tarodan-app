import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma";
import { AnalyticsQueryDto } from "./dto";
import { OrderStatus, ProductStatus } from "@prisma/client";
import { AdminAnalyticsCommonService } from "./admin-analytics-common.service";

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
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const [
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
        where: {
          status: { in: [OrderStatus.completed, OrderStatus.delivered] },
        },
      }),
      this.prisma.order.aggregate({
        _sum: { commissionAmount: true },
        where: {
          createdAt: { gte: sevenDaysAgo },
          status: { in: [OrderStatus.completed, OrderStatus.delivered] },
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

    return {
      users: {
        total: totalUsers,
        new7d: newUsers7d,
      },
      products: {
        total: totalProducts,
        active: activeProducts,
        pending: pendingProducts,
      },
      orders: {
        total: totalOrders,
        last7d: orders7d,
        completed: completedOrders,
      },
      revenue: {
        total: Number(totalRevenue._sum.commissionAmount || 0),
        last7d: Number(revenue7d._sum.commissionAmount || 0),
      },
      categoryDistribution,
    };
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
