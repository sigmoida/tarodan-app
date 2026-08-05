import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma";
import { ReportQueryDto } from "./dto";
import {
  OrderStatus,
  ProductKind,
  ProductStatus,
  TradeStatus,
} from "@prisma/client";

/**
 * Rapor üreticileri — AdminAnalyticsService'ten birebir taşındı: generateSalesReport,
 * generateUsersReport, generateProductsReport, generateTradesReport, getCommissionReport,
 * generateCustomReport (CSV/PDF/JSON). AdminAnalyticsService ince alt-facade olarak buraya
 * delege eder. Salt-okunur toplama; yalnız prisma enjekte eder.
 */
@Injectable()
export class AdminAnalyticsReportService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Generate sales report
   * Requirement: GET /admin/reports/sales (7.2)
   */
  async generateSalesReport(query: ReportQueryDto) {
    const endDate = query.endDate ? new Date(query.endDate) : new Date();
    const startDate = query.startDate
      ? new Date(query.startDate)
      : new Date(endDate.getTime() - 30 * 24 * 60 * 60 * 1000);

    const orders = await this.prisma.order.findMany({
      where: {
        createdAt: { gte: startDate, lte: endDate },
        status: {
          in: [OrderStatus.completed, OrderStatus.delivered, OrderStatus.paid],
        },
      },
      include: {
        buyer: { select: { displayName: true, email: true } },
        seller: { select: { displayName: true, email: true } },
        product: {
          select: {
            title: true,
            category: { select: { name: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    const reportData = orders.map((o) => ({
      orderNumber: o.orderNumber,
      date: o.createdAt.toISOString().split("T")[0],
      buyer: o.buyer.displayName,
      buyerEmail: o.buyer.email,
      seller: o.seller.displayName,
      sellerEmail: o.seller.email,
      product: o.product.title,
      category: o.product.category?.name || "N/A",
      amount: Number(o.totalAmount),
      commission: Number(o.commissionAmount),
      status: o.status,
    }));

    const summary = {
      totalOrders: reportData.length,
      totalSales: reportData.reduce((sum, r) => sum + r.amount, 0),
      totalCommission: reportData.reduce((sum, r) => sum + r.commission, 0),
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      generatedAt: new Date().toISOString(),
    };

    // For CSV format
    if (query.format === "csv") {
      const headers =
        "Order Number,Date,Buyer,Buyer Email,Seller,Seller Email,Product,Category,Amount,Commission,Status\n";
      const rows = reportData
        .map(
          (r) =>
            `${r.orderNumber},${r.date},${r.buyer},${r.buyerEmail},${r.seller},${r.sellerEmail},"${r.product}",${r.category},${r.amount},${r.commission},${r.status}`,
        )
        .join("\n");
      return { format: "csv", content: headers + rows, summary };
    }

    // For PDF, return structured data (actual PDF generation would require a library like pdfkit)
    if (query.format === "pdf") {
      return {
        format: "pdf",
        data: reportData,
        summary,
        message:
          "PDF generation requires frontend implementation with the provided data",
      };
    }

    // Default JSON format
    return { format: "json", data: reportData, summary };
  }

  /**
   * Generate users report (CSV/PDF/JSON)
   * GET /admin/reports/users
   */
  async generateUsersReport(query: ReportQueryDto) {
    const endDate = query.endDate ? new Date(query.endDate) : new Date();
    const startDate = query.startDate
      ? new Date(query.startDate)
      : new Date(endDate.getTime() - 30 * 24 * 60 * 60 * 1000);

    const users = await this.prisma.user.findMany({
      where: { createdAt: { gte: startDate, lte: endDate } },
      select: {
        id: true,
        email: true,
        displayName: true,
        phone: true,
        isSeller: true,
        sellerType: true,
        isVerified: true,
        isBanned: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
    });

    const reportData = users.map((u) => ({
      id: u.id,
      email: u.email,
      displayName: u.displayName ?? "",
      phone: u.phone ?? "",
      isSeller: u.isSeller,
      sellerType: u.sellerType ?? "",
      isVerified: u.isVerified,
      isBanned: (u as any).isBanned ?? false,
      createdAt: u.createdAt.toISOString().split("T")[0],
    }));

    const [totalUsers, newInPeriod] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.user.count({
        where: { createdAt: { gte: startDate, lte: endDate } },
      }),
    ]);

    const summary = {
      totalUsers,
      newInPeriod: reportData.length,
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      generatedAt: new Date().toISOString(),
    };

    if (query.format === "csv") {
      const headers =
        "Id,Email,Display Name,Phone,Is Seller,Seller Type,Verified,Banned,Created At\n";
      const rows = reportData
        .map(
          (r) =>
            `${r.id},${r.email},"${(r.displayName || "").replace(/"/g, '""')}",${r.phone || ""},${r.isSeller},${r.sellerType},${r.isVerified},${r.isBanned},${r.createdAt}`,
        )
        .join("\n");
      return { format: "csv", content: headers + rows, summary };
    }

    if (query.format === "pdf") {
      return {
        format: "pdf",
        data: reportData,
        summary,
        message:
          "PDF generation requires frontend implementation with the provided data",
      };
    }

    return { format: "json", data: reportData, summary };
  }

  /**
   * Generate products report (CSV/PDF/JSON)
   * GET /admin/reports/products - also used by analytics dashboard (summary + categoryDistribution)
   */
  async generateProductsReport(query: ReportQueryDto) {
    const endDate = query.endDate ? new Date(query.endDate) : new Date();
    const startDate = query.startDate
      ? new Date(query.startDate)
      : new Date(endDate.getTime() - 30 * 24 * 60 * 60 * 1000);

    const [products, total, active, pending, byCategory, avgPrice] =
      await Promise.all([
        this.prisma.product.findMany({
          where: {
            kind: ProductKind.listing,
            createdAt: { gte: startDate, lte: endDate },
          },
          include: {
            seller: { select: { id: true, displayName: true, email: true } },
            category: { select: { id: true, name: true } },
          },
          orderBy: { createdAt: "desc" },
        }),
        this.prisma.product.count({ where: { kind: ProductKind.listing } }),
        this.prisma.product.count({
          where: { kind: ProductKind.listing, status: ProductStatus.active },
        }),
        this.prisma.product.count({
          where: { kind: ProductKind.listing, status: ProductStatus.pending },
        }),
        this.prisma.product.groupBy({
          by: ["categoryId"],
          where: {
            kind: ProductKind.listing,
            createdAt: { gte: startDate, lte: endDate },
          },
          _count: { id: true },
        }),
        this.prisma.product.aggregate({
          where: {
            kind: ProductKind.listing,
            createdAt: { gte: startDate, lte: endDate },
            status: ProductStatus.active,
          },
          _avg: { price: true },
        }),
      ]);

    const categoryIds = [
      ...new Set(byCategory.map((c) => c.categoryId).filter(Boolean)),
    ] as string[];
    const categories = await this.prisma.category.findMany({
      where: { id: { in: categoryIds } },
      select: { id: true, name: true },
    });
    const categoryMap = new Map(categories.map((c) => [c.id, c.name]));
    const totalInPeriod = byCategory.reduce((sum, c) => sum + c._count.id, 0);
    const categoryDistribution = byCategory
      .map((c) => {
        const name = c.categoryId
          ? categoryMap.get(c.categoryId) || "Kategorisiz"
          : "Kategorisiz";
        const count = c._count.id;
        const percentage =
          totalInPeriod > 0
            ? Math.round((count / totalInPeriod) * 1000) / 10
            : 0;
        return { name, count, percentage };
      })
      .sort((a, b) => b.count - a.count);

    const reportData = products.map((p) => ({
      id: p.id,
      title: p.title,
      price: Number(p.price),
      status: p.status,
      category: p.category?.name ?? "N/A",
      sellerName: p.seller?.displayName ?? "",
      sellerEmail: p.seller?.email ?? "",
      createdAt: p.createdAt.toISOString().split("T")[0],
    }));

    const summary = {
      totalProducts: total,
      activeProducts: active,
      pendingProducts: pending,
      averagePrice: Number(avgPrice._avg.price || 0),
      categoryDistribution,
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      generatedAt: new Date().toISOString(),
    };

    if (query.format === "csv") {
      const headers =
        "Id,Title,Price,Status,Category,Seller Name,Seller Email,Created At\n";
      const rows = reportData
        .map(
          (r) =>
            `${r.id},"${(r.title || "").replace(/"/g, '""')}",${r.price},${r.status},${r.category},"${(r.sellerName || "").replace(/"/g, '""')}",${r.sellerEmail},${r.createdAt}`,
        )
        .join("\n");
      return { format: "csv", content: headers + rows, summary };
    }

    if (query.format === "pdf") {
      return {
        format: "pdf",
        data: reportData,
        summary,
        message:
          "PDF generation requires frontend implementation with the provided data",
      };
    }

    // JSON: top-level summary fields for analytics dashboard + data for export
    return {
      format: "json",
      data: reportData,
      summary,
      totalProducts: total,
      activeProducts: active,
      pendingProducts: pending,
      averagePrice: Number(avgPrice._avg.price || 0),
      categoryDistribution,
    };
  }

  /**
   * Generate trades report (CSV/PDF/JSON)
   * GET /admin/reports/trades - also used by analytics dashboard
   */
  async generateTradesReport(query: ReportQueryDto) {
    const endDate = query.endDate ? new Date(query.endDate) : new Date();
    const startDate = query.startDate
      ? new Date(query.startDate)
      : new Date(endDate.getTime() - 30 * 24 * 60 * 60 * 1000);

    const trades = await this.prisma.trade.findMany({
      where: { createdAt: { gte: startDate, lte: endDate } },
      include: {
        initiator: { select: { id: true, displayName: true, email: true } },
        receiver: { select: { id: true, displayName: true, email: true } },
        items: {
          include: { product: { select: { title: true, price: true } } },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    const [totalTrades, completedTrades, pendingTrades, disputedTrades] =
      await Promise.all([
        this.prisma.trade.count(),
        this.prisma.trade.count({ where: { status: TradeStatus.completed } }),
        this.prisma.trade.count({
          where: {
            status: { in: [TradeStatus.pending, TradeStatus.accepted] },
          },
        }),
        this.prisma.trade.count({
          where: { dispute: { isNot: null } },
        }),
      ]);

    const reportData = trades.map((t) => ({
      id: t.id,
      status: t.status,
      initiatorName: t.initiator?.displayName ?? "",
      initiatorEmail: t.initiator?.email ?? "",
      receiverName: t.receiver?.displayName ?? "",
      receiverEmail: t.receiver?.email ?? "",
      createdAt: t.createdAt.toISOString().split("T")[0],
      completedAt: t.completedAt?.toISOString().split("T")[0] ?? "",
    }));

    const summary = {
      totalTrades,
      completedTrades,
      pendingTrades,
      disputedTrades,
      averageTradeValue: 0,
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      generatedAt: new Date().toISOString(),
    };

    if (query.format === "csv") {
      const headers =
        "Id,Status,Initiator Name,Initiator Email,Receiver Name,Receiver Email,Created At,Completed At\n";
      const rows = reportData
        .map(
          (r) =>
            `${r.id},${r.status},${r.initiatorName},${r.initiatorEmail},${r.receiverName},${r.receiverEmail},${r.createdAt},${r.completedAt}`,
        )
        .join("\n");
      return { format: "csv", content: headers + rows, summary };
    }

    if (query.format === "pdf") {
      return {
        format: "pdf",
        data: reportData,
        summary,
        message:
          "PDF generation requires frontend implementation with the provided data",
      };
    }

    // JSON: top-level summary fields for analytics dashboard + data for export
    return {
      format: "json",
      data: reportData,
      summary,
      totalTrades: summary.totalTrades,
      completedTrades: summary.completedTrades,
      pendingTrades: summary.pendingTrades,
      disputedTrades: summary.disputedTrades,
      averageTradeValue: summary.averageTradeValue,
    };
  }

  /**
   * Get commission report
   * Requirement: GET /admin/reports/commission (7.2)
   */
  async getCommissionReport(query: ReportQueryDto) {
    const endDate = query.endDate ? new Date(query.endDate) : new Date();
    const startDate = query.startDate
      ? new Date(query.startDate)
      : new Date(endDate.getTime() - 30 * 24 * 60 * 60 * 1000);

    // Get orders with commission
    const orders = await this.prisma.order.findMany({
      where: {
        createdAt: { gte: startDate, lte: endDate },
        status: { in: [OrderStatus.completed, OrderStatus.delivered] },
      },
      include: {
        seller: {
          select: {
            id: true,
            displayName: true,
            sellerType: true,
          },
        },
        product: {
          select: {
            category: { select: { id: true, name: true } },
          },
        },
      },
    });

    // Group by seller
    const sellerCommissions = new Map<
      string,
      {
        sellerId: string;
        sellerName: string;
        sellerType: string | null;
        orderCount: number;
        totalSales: number;
        totalCommission: number;
      }
    >();

    orders.forEach((order) => {
      const key = order.sellerId;
      const existing = sellerCommissions.get(key) || {
        sellerId: order.sellerId,
        sellerName: order.seller.displayName,
        sellerType: order.seller.sellerType,
        orderCount: 0,
        totalSales: 0,
        totalCommission: 0,
      };
      sellerCommissions.set(key, {
        ...existing,
        orderCount: existing.orderCount + 1,
        totalSales: existing.totalSales + Number(order.totalAmount),
        totalCommission:
          existing.totalCommission + Number(order.commissionAmount),
      });
    });

    // Group by category
    const categoryCommissions = new Map<
      string,
      {
        categoryId: string;
        categoryName: string;
        orderCount: number;
        totalSales: number;
        totalCommission: number;
      }
    >();

    orders.forEach((order) => {
      const categoryId = order.product.category?.id || "uncategorized";
      const categoryName = order.product.category?.name || "Kategorisiz";
      const existing = categoryCommissions.get(categoryId) || {
        categoryId,
        categoryName,
        orderCount: 0,
        totalSales: 0,
        totalCommission: 0,
      };
      categoryCommissions.set(categoryId, {
        ...existing,
        orderCount: existing.orderCount + 1,
        totalSales: existing.totalSales + Number(order.totalAmount),
        totalCommission:
          existing.totalCommission + Number(order.commissionAmount),
      });
    });

    const summary = {
      totalOrders: orders.length,
      totalSales: orders.reduce((sum, o) => sum + Number(o.totalAmount), 0),
      totalCommission: orders.reduce(
        (sum, o) => sum + Number(o.commissionAmount),
        0,
      ),
      averageCommissionRate:
        orders.length > 0
          ? Math.round(
              (orders.reduce((sum, o) => sum + Number(o.commissionAmount), 0) /
                orders.reduce((sum, o) => sum + Number(o.totalAmount), 0)) *
                10000,
            ) / 100
          : 0,
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
    };

    return {
      bySeller: Array.from(sellerCommissions.values()).sort(
        (a, b) => b.totalCommission - a.totalCommission,
      ),
      byCategory: Array.from(categoryCommissions.values()).sort(
        (a, b) => b.totalCommission - a.totalCommission,
      ),
      summary,
    };
  }

  /**
   * Generate custom report with flexible parameters
   * Requirement: GET /admin/reports/custom (project.txt)
   */
  async generateCustomReport(query: ReportQueryDto) {
    const endDate = query.endDate ? new Date(query.endDate) : new Date();
    const startDate = query.startDate
      ? new Date(query.startDate)
      : new Date(endDate.getTime() - 30 * 24 * 60 * 60 * 1000);

    // Get comprehensive stats for the period
    const [orderStats, userStats, productStats, topSellers, topCategories] =
      await Promise.all([
        // Order statistics
        this.prisma.order.aggregate({
          _count: true,
          _sum: { totalAmount: true, commissionAmount: true },
          where: {
            createdAt: { gte: startDate, lte: endDate },
            status: {
              in: [
                OrderStatus.completed,
                OrderStatus.delivered,
                OrderStatus.paid,
              ],
            },
          },
        }),
        // User statistics
        this.prisma.user.aggregate({
          _count: true,
          where: {
            createdAt: { gte: startDate, lte: endDate },
          },
        }),
        // Product statistics
        this.prisma.product.aggregate({
          _count: true,
          where: {
            kind: ProductKind.listing,
            createdAt: { gte: startDate, lte: endDate },
          },
        }),
        // Top sellers by revenue
        this.prisma.order.groupBy({
          by: ["sellerId"],
          _sum: { totalAmount: true },
          _count: true,
          where: {
            createdAt: { gte: startDate, lte: endDate },
            status: { in: [OrderStatus.completed, OrderStatus.delivered] },
          },
          orderBy: { _sum: { totalAmount: "desc" } },
          take: 10,
        }),
        // Top categories
        this.prisma.order.findMany({
          where: {
            createdAt: { gte: startDate, lte: endDate },
            status: { in: [OrderStatus.completed, OrderStatus.delivered] },
          },
          include: {
            product: {
              select: { category: { select: { id: true, name: true } } },
            },
          },
        }),
      ]);

    // Process top sellers to get names
    const sellerIds = topSellers.map((s) => s.sellerId);
    const sellers = await this.prisma.user.findMany({
      where: { id: { in: sellerIds } },
      select: { id: true, displayName: true },
    });
    const sellerMap = new Map(sellers.map((s) => [s.id, s.displayName]));

    // Group by category
    const categoryRevenue = new Map<
      string,
      { name: string; revenue: number; count: number }
    >();
    topCategories.forEach((order) => {
      const catId = order.product.category?.id || "uncategorized";
      const catName = order.product.category?.name || "Kategorisiz";
      const existing = categoryRevenue.get(catId) || {
        name: catName,
        revenue: 0,
        count: 0,
      };
      categoryRevenue.set(catId, {
        name: catName,
        revenue: existing.revenue + Number(order.totalAmount),
        count: existing.count + 1,
      });
    });

    return {
      period: {
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
      },
      summary: {
        totalOrders: orderStats._count,
        totalRevenue: Number(orderStats._sum.totalAmount || 0),
        totalCommission: Number(orderStats._sum.commissionAmount || 0),
        newUsers: userStats._count,
        newProducts: productStats._count,
      },
      topSellers: topSellers.map((s) => ({
        sellerId: s.sellerId,
        sellerName: sellerMap.get(s.sellerId) || "Unknown",
        revenue: Number(s._sum.totalAmount || 0),
        orderCount: s._count,
      })),
      topCategories: Array.from(categoryRevenue.entries())
        .map(([id, data]) => ({
          categoryId: id,
          categoryName: data.name,
          revenue: Math.round(data.revenue * 100) / 100,
          orderCount: data.count,
        }))
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 10),
      generatedAt: new Date().toISOString(),
    };
  }
}
