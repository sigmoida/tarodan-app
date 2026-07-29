import { Injectable, BadRequestException } from "@nestjs/common";
import { PrismaService } from "../../prisma";
import {
  OrderStatus,
  TradeStatus,
  TicketStatus,
  ProductStatus,
} from "@prisma/client";
import { TarodanWebSocketGateway } from "../websocket/websocket.gateway";

export interface ReportFilter {
  startDate?: Date;
  endDate?: Date;
  status?: string;
}

export interface SalesReport {
  totalOrders: number;
  totalRevenue: number;
  totalCommission: number;
  averageOrderValue: number;
  ordersByStatus: Record<string, number>;
  dailySales: Array<{
    date: string;
    orders: number;
    revenue: number;
    commission: number;
  }>;
}

export interface TradeReport {
  totalTrades: number;
  completedTrades: number;
  cancelledTrades: number;
  averageTradeValue: number;
  tradesByStatus: Record<string, number>;
  dailyTrades: Array<{
    date: string;
    total: number;
    completed: number;
    cancelled: number;
  }>;
}

export interface UserReport {
  totalUsers: number;
  newUsers: number;
  verifiedSellers: number;
  activeUsers: number;
  usersByMembership: Record<string, number>;
  dailyRegistrations: Array<{
    date: string;
    count: number;
  }>;
}

export interface ProductReport {
  totalProducts: number;
  activeProducts: number;
  pendingProducts: number;
  soldProducts: number;
  averagePrice: number;
  categoryDistribution: Array<{
    name: string;
    count: number;
    percentage: number;
  }>;
  productsByCondition: Record<string, number>;
}

@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly websocketGateway: TarodanWebSocketGateway,
  ) {}

  // ==========================================================================
  // SALES REPORT
  // ==========================================================================

  async generateSalesReport(filter: ReportFilter): Promise<SalesReport> {
    const { startDate, endDate } = this.getDateRange(filter);

    const orders = await this.prisma.order.findMany({
      where: {
        createdAt: {
          gte: startDate,
          lte: endDate,
        },
      },
      orderBy: { createdAt: "asc" },
    });

    const totalOrders = orders.length;
    const totalRevenue = orders.reduce(
      (sum, o) => sum + parseFloat(o.totalAmount.toString()),
      0,
    );
    const totalCommission = orders.reduce(
      (sum, o) => sum + parseFloat(o.commissionAmount.toString()),
      0,
    );
    const averageOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;

    // Orders by status
    const ordersByStatus: Record<string, number> = {};
    for (const status of Object.values(OrderStatus)) {
      ordersByStatus[status] = orders.filter((o) => o.status === status).length;
    }

    // Daily sales
    const dailySales = this.aggregateByDate(orders, (o) => ({
      revenue: parseFloat(o.totalAmount.toString()),
      commission: parseFloat(o.commissionAmount.toString()),
    }));

    return {
      totalOrders,
      totalRevenue: Math.round(totalRevenue * 100) / 100,
      totalCommission: Math.round(totalCommission * 100) / 100,
      averageOrderValue: Math.round(averageOrderValue * 100) / 100,
      ordersByStatus,
      dailySales: dailySales.map((d) => ({
        date: d.date,
        orders: d.count,
        revenue: Math.round((d.revenue as number) * 100) / 100,
        commission: Math.round((d.commission as number) * 100) / 100,
      })),
    };
  }

  // ==========================================================================
  // TRADE REPORT
  // ==========================================================================

  async generateTradeReport(filter: ReportFilter): Promise<TradeReport> {
    const { startDate, endDate } = this.getDateRange(filter);

    const trades = await this.prisma.trade.findMany({
      where: {
        createdAt: {
          gte: startDate,
          lte: endDate,
        },
      },
      include: {
        items: true,
      },
      orderBy: { createdAt: "asc" },
    });

    const totalTrades = trades.length;
    const completedTrades = trades.filter(
      (t) => t.status === TradeStatus.completed,
    ).length;
    const cancelledTrades = trades.filter(
      (t) => t.status === TradeStatus.cancelled,
    ).length;

    // Calculate average trade value
    const tradeValues = trades.map((t) => {
      const initiatorItems = (t.items || []).filter(
        (i: { side: string }) => i.side === "initiator",
      );
      const receiverItems = (t.items || []).filter(
        (i: { side: string }) => i.side === "receiver",
      );
      const initiatorValue = initiatorItems.reduce(
        (sum: number, item: { valueAtTrade: { toString: () => string } }) =>
          sum + parseFloat(item.valueAtTrade.toString()),
        0,
      );
      const receiverValue = receiverItems.reduce(
        (sum: number, item: { valueAtTrade: { toString: () => string } }) =>
          sum + parseFloat(item.valueAtTrade.toString()),
        0,
      );
      return (initiatorValue + receiverValue) / 2;
    });
    const averageTradeValue =
      tradeValues.length > 0
        ? tradeValues.reduce((a, b) => a + b, 0) / tradeValues.length
        : 0;

    // Trades by status
    const tradesByStatus: Record<string, number> = {};
    for (const status of Object.values(TradeStatus)) {
      tradesByStatus[status] = trades.filter((t) => t.status === status).length;
    }

    // Daily trades
    const dailyData = this.aggregateByDate(trades, (t) => ({
      completed: t.status === TradeStatus.completed ? 1 : 0,
      cancelled: t.status === TradeStatus.cancelled ? 1 : 0,
    }));

    return {
      totalTrades,
      completedTrades,
      cancelledTrades,
      averageTradeValue: Math.round(averageTradeValue * 100) / 100,
      tradesByStatus,
      dailyTrades: dailyData.map((d) => ({
        date: d.date,
        total: d.count,
        completed: d.completed as number,
        cancelled: d.cancelled as number,
      })),
    };
  }

  // ==========================================================================
  // USER REPORT
  // ==========================================================================

  async generateUserReport(filter: ReportFilter): Promise<UserReport> {
    const { startDate, endDate } = this.getDateRange(filter);

    const [totalUsers, newUsers, verifiedSellers, memberships] =
      await Promise.all([
        this.prisma.user.count(),
        this.prisma.user.count({
          where: {
            createdAt: {
              gte: startDate,
              lte: endDate,
            },
          },
        }),
        this.prisma.user.count({
          where: { sellerType: "verified" },
        }),
        this.prisma.userMembership.findMany({
          include: { tier: true },
        }),
      ]);

    // Users by membership tier
    const usersByMembership: Record<string, number> = {};
    for (const membership of memberships) {
      const tierName = membership.tier.name;
      usersByMembership[tierName] = (usersByMembership[tierName] || 0) + 1;
    }

    // Daily registrations
    const registrations = await this.prisma.user.findMany({
      where: {
        createdAt: {
          gte: startDate,
          lte: endDate,
        },
      },
      select: { createdAt: true },
      orderBy: { createdAt: "asc" },
    });

    const dailyRegistrations = this.aggregateByDate(registrations, () => ({}));

    // Active users (logged in within last 30 days - approximated by updated_at)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const activeUsers = await this.prisma.user.count({
      where: { updatedAt: { gte: thirtyDaysAgo } },
    });

    return {
      totalUsers,
      newUsers,
      verifiedSellers,
      activeUsers,
      usersByMembership,
      dailyRegistrations: dailyRegistrations.map((d) => ({
        date: d.date,
        count: d.count,
      })),
    };
  }

  // ==========================================================================
  // PRODUCT REPORT
  // ==========================================================================

  async generateProductReport(filter: ReportFilter): Promise<ProductReport> {
    const { startDate, endDate } = this.getDateRange(filter);

    const products = await this.prisma.product.findMany({
      where: {
        createdAt: {
          gte: startDate,
          lte: endDate,
        },
      },
      include: { category: true },
    });

    const totalProducts = products.length;
    const activeProducts = products.filter(
      (p) => p.status === ProductStatus.active,
    ).length;
    const pendingProducts = products.filter(
      (p) => p.status === ProductStatus.pending,
    ).length;
    const soldProducts = products.filter(
      (p) => p.status === ProductStatus.sold,
    ).length;

    const prices = products.map((p) => parseFloat(p.price.toString()));
    const averagePrice =
      prices.length > 0 ? prices.reduce((a, b) => a + b, 0) / prices.length : 0;

    // Products by category -> categoryDistribution [{ name, count, percentage }]
    const categoryCounts: Record<string, number> = {};
    for (const product of products) {
      const categoryName = product.category.name;
      categoryCounts[categoryName] = (categoryCounts[categoryName] || 0) + 1;
    }
    const totalForPct = totalProducts || 1;
    const categoryDistribution = Object.entries(categoryCounts)
      .map(([name, count]) => ({
        name,
        count,
        percentage: Math.round((count / totalForPct) * 1000) / 10,
      }))
      .sort((a, b) => b.count - a.count);

    // Products by condition
    const productsByCondition: Record<string, number> = {};
    for (const product of products) {
      productsByCondition[product.condition] =
        (productsByCondition[product.condition] || 0) + 1;
    }

    return {
      totalProducts,
      activeProducts,
      pendingProducts,
      soldProducts,
      averagePrice: Math.round(averagePrice * 100) / 100,
      categoryDistribution,
      productsByCondition,
    };
  }

  // ==========================================================================
  // EXPORT TO CSV
  // ==========================================================================

  async exportSalesReportCSV(filter: ReportFilter): Promise<string> {
    const report = await this.generateSalesReport(filter);

    let csv = "Tarih,Sipariş Sayısı,Gelir (TRY),Komisyon (TRY)\n";
    for (const day of report.dailySales) {
      csv += `${day.date},${day.orders},${day.revenue},${day.commission}\n`;
    }

    csv += "\nÖzet\n";
    csv += `Toplam Sipariş,${report.totalOrders}\n`;
    csv += `Toplam Gelir,${report.totalRevenue}\n`;
    csv += `Toplam Komisyon,${report.totalCommission}\n`;
    csv += `Ortalama Sipariş Değeri,${report.averageOrderValue}\n`;

    return csv;
  }

  async exportTradeReportCSV(filter: ReportFilter): Promise<string> {
    const report = await this.generateTradeReport(filter);

    let csv = "Tarih,Toplam Takas,Tamamlanan,İptal Edilen\n";
    for (const day of report.dailyTrades) {
      csv += `${day.date},${day.total},${day.completed},${day.cancelled}\n`;
    }

    csv += "\nÖzet\n";
    csv += `Toplam Takas,${report.totalTrades}\n`;
    csv += `Tamamlanan,${report.completedTrades}\n`;
    csv += `İptal Edilen,${report.cancelledTrades}\n`;
    csv += `Ortalama Takas Değeri,${report.averageTradeValue}\n`;

    return csv;
  }

  async exportUserReportCSV(filter: ReportFilter): Promise<string> {
    const report = await this.generateUserReport(filter);

    let csv = "Tarih,Yeni Kayıt\n";
    for (const day of report.dailyRegistrations) {
      csv += `${day.date},${day.count}\n`;
    }

    csv += "\nÖzet\n";
    csv += `Toplam Kullanıcı,${report.totalUsers}\n`;
    csv += `Yeni Kullanıcı,${report.newUsers}\n`;
    csv += `Onaylı Satıcı,${report.verifiedSellers}\n`;
    csv += `Aktif Kullanıcı,${report.activeUsers}\n`;

    return csv;
  }

  // ==========================================================================
  // EXPORT TO JSON (for PDF generation on frontend)
  // ==========================================================================

  async exportSalesReportJSON(filter: ReportFilter): Promise<object> {
    const report = await this.generateSalesReport(filter);
    return {
      title: "Satış Raporu",
      generatedAt: new Date().toISOString(),
      filter,
      data: report,
    };
  }

  // ==========================================================================
  // HELPER METHODS
  // ==========================================================================

  private getDateRange(filter: ReportFilter): {
    startDate: Date;
    endDate: Date;
  } {
    const endDate = filter.endDate || new Date();
    const startDate =
      filter.startDate ||
      new Date(
        endDate.getFullYear(),
        endDate.getMonth() - 1,
        endDate.getDate(),
      );

    return { startDate, endDate };
  }

  private aggregateByDate<T extends { createdAt: Date }>(
    items: T[],
    extractor: (item: T) => Record<string, number>,
  ): Array<{ date: string; count: number; [key: string]: string | number }> {
    const grouped: Record<string, { count: number; [key: string]: number }> =
      {};

    for (const item of items) {
      const date = item.createdAt.toISOString().split("T")[0];
      if (!grouped[date]) {
        grouped[date] = { count: 0 };
      }
      grouped[date].count++;

      const extracted = extractor(item);
      for (const [key, value] of Object.entries(extracted)) {
        grouped[date][key] = (grouped[date][key] || 0) + value;
      }
    }

    return Object.entries(grouped)
      .map(([date, data]) => ({ date, ...data }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  // ==========================================================================
  // SITE ACCESS REPORTS
  // ==========================================================================

  /**
   * Generate site access report
   * Requirement: Site access reports (requirements.txt)
   */
  async generateAccessReport(filter: ReportFilter) {
    const { startDate, endDate } = this.getDateRange(filter);

    // NOTE: There is no anonymous-visitor analytics pipeline yet, so access
    // reporting reflects AUTHENTICATED users only. Real metrics are derived
    // from `lastActivityAt` (activity) and `createdAt` (new registrations).
    // Page views, device / traffic / geographic breakdowns are intentionally
    // omitted rather than fabricated.
    const activeUsers = await this.prisma.user.findMany({
      where: {
        lastActivityAt: {
          gte: startDate,
          lte: endDate,
        },
      },
      select: { id: true, lastActivityAt: true },
    });

    const newVisitors = await this.prisma.user.count({
      where: {
        createdAt: {
          gte: startDate,
          lte: endDate,
        },
      },
    });

    const uniqueVisitors = activeUsers.length;
    const dailyVisits = this.buildDailyAccessData(
      startDate,
      endDate,
      activeUsers,
    );

    return {
      period: {
        start: startDate,
        end: endDate,
      },
      summary: {
        uniqueVisitors,
        newVisitors,
      },
      dailyVisits,
      scope: "authenticated",
    };
  }

  /**
   * Get real-time visitor statistics.
   *
   * Counts AUTHENTICATED users only:
   * - `liveVisitors`: users currently connected via websocket presence.
   * - `dailyActiveVisitors`: users with recorded activity since midnight
   *   (based on `lastActivityAt`).
   *
   * Anonymous visitors are out of scope until a real analytics pipeline exists.
   */
  async getRealtimeVisitorStats() {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const dailyActiveVisitors = await this.prisma.user.count({
      where: {
        lastActivityAt: {
          gte: startOfToday,
        },
      },
    });

    return {
      liveVisitors: this.websocketGateway.getOnlineUsersCount(),
      dailyActiveVisitors,
      scope: "authenticated",
      generatedAt: new Date(),
    };
  }

  /**
   * Export access report as CSV
   */
  async exportAccessReportCSV(filter: ReportFilter): Promise<string> {
    const report = await this.generateAccessReport(filter);

    let csv = "Date,Active Visitors\n";

    for (const day of report.dailyVisits) {
      csv += `${day.date},${day.activeVisitors}\n`;
    }

    csv += "\n\nSummary\n";
    csv += "Metric,Value\n";
    csv += `Unique Visitors,${report.summary.uniqueVisitors}\n`;
    csv += `New Visitors,${report.summary.newVisitors}\n`;

    return csv;
  }

  /**
   * Build daily active-visitor counts from authenticated user activity.
   *
   * Each user is bucketed on the day of their most recent activity
   * (`lastActivityAt`); days with no activity report zero.
   */
  private buildDailyAccessData(
    startDate: Date,
    endDate: Date,
    users: Array<{ lastActivityAt: Date | null }>,
  ) {
    const buckets = new Map<string, number>();
    for (const user of users) {
      if (!user.lastActivityAt) continue;
      const key = user.lastActivityAt.toISOString().split("T")[0];
      buckets.set(key, (buckets.get(key) ?? 0) + 1);
    }

    const days: Array<{ date: string; activeVisitors: number }> = [];
    const currentDate = new Date(startDate);
    while (currentDate <= endDate) {
      const key = currentDate.toISOString().split("T")[0];
      days.push({ date: key, activeVisitors: buckets.get(key) ?? 0 });
      currentDate.setDate(currentDate.getDate() + 1);
    }

    return days;
  }
}
