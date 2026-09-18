import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../../prisma";
import { AnalyticsQueryDto } from "../dto";
import {
  CommissionLedgerStatus,
  OrderStatus,
  Prisma,
  ProductKind,
  ProductStatus,
} from "@prisma/client";
import {
  DASHBOARD_METRIC_KEYS,
  type DashboardMetric,
  type DashboardMetricKey,
  type DashboardPeriodQuery,
  type DashboardStatsResponse,
} from "@tarodan/types";
import { AdminAnalyticsCommonService } from "./admin-analytics-common.service";
import {
  resolveDashboardRange,
  type DashboardDateWindow,
} from "./dashboard-period.helper";
import {
  ledgerNetRevenue,
  type LedgerNetSums,
} from "../../commission/ledger-net";

const REALIZED_ORDER_STATUSES: OrderStatus[] = [
  OrderStatus.paid,
  OrderStatus.delivered,
  OrderStatus.completed,
];

type LedgerAggregate = { _sum: LedgerNetSums };

/**
 * Bir dashboard metriğinin TEK tanımı. `window` verilmediğinde sorgu tarih
 * filtresi uygulamaz — yani "tüm zamanlar" da aynı tanımdan okunur.
 */
interface DashboardMetricDefinition {
  query: (
    window: DashboardDateWindow | undefined,
  ) => Prisma.PrismaPromise<unknown>;
  /** Ham sonucu sayıya çevirir; varsayılan: `count` sonucu. */
  toValue?: (raw: unknown) => number;
}

const countValue = (raw: unknown): number => Number(raw ?? 0);

/** `aggregate` sonucundaki tek bir `_sum` alanını okur. */
const sumOf =
  (field: "totalAmount" | "commissionAmount") =>
  (raw: unknown): number =>
    Number((raw as { _sum: Record<string, unknown> })?._sum?.[field] ?? 0);

const roundMetric = (value: number): number => Math.round(value * 100) / 100;

/** Seçili dönem ile bir önceki eşit pencere arasındaki yüzde değişim. */
const changePercent = (current: number, previous: number): number => {
  if (previous === 0) return current === 0 ? 0 : 100;
  return roundMetric(((current - previous) / Math.abs(previous)) * 100);
};

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
   * Dashboard istatistikleri (admin açılış ekranı).
   *
   * Her metrik TEK yerde tanımlanır ({@link metricDefinitions}); seçilen dönem,
   * ondan önceki eşit uzunluktaki pencere (trend için) ve tüm zamanlar aynı
   * tanımdan, aynı `$transaction` içinde okunur. Böylece "dönem" ile "tüm
   * zamanlar" arasında sessiz bir formül ayrışması olamaz.
   */
  async getDashboardStats(
    query?: DashboardPeriodQuery,
  ): Promise<DashboardStatsResponse> {
    const range = resolveDashboardRange(query);
    const definitions = this.metricDefinitions();

    // `undefined` pencere = tarih filtresi yok = tüm zamanlar.
    const windows: Array<DashboardDateWindow | undefined> = [
      range.current,
      range.previous,
      undefined,
    ];

    const rows = await this.prisma.$transaction(
      DASHBOARD_METRIC_KEYS.flatMap((key) =>
        windows.map((window) => definitions[key].query(window)),
      ),
    );

    const metrics = {} as Record<DashboardMetricKey, DashboardMetric>;
    DASHBOARD_METRIC_KEYS.forEach((key, index) => {
      const toValue = definitions[key].toValue ?? countValue;
      const offset = index * windows.length;
      const period = roundMetric(toValue(rows[offset]));
      const previous = roundMetric(toValue(rows[offset + 1]));
      const allTime = roundMetric(toValue(rows[offset + 2]));

      metrics[key] = {
        period,
        previous,
        allTime,
        changePercent: changePercent(period, previous),
      };
    });

    return {
      range: {
        type: range.type,
        from: range.current.gte.toISOString(),
        to: range.current.lte.toISOString(),
      },
      metrics,
    };
  }

  /**
   * Metrik kataloğu: anahtar → o metriğin TEK sorgu tanımı.
   *
   * Tanım bir pencere alır; `undefined` geldiğinde tarih filtresi uygulanmaz.
   * Ürün/kullanıcı durum geçmişi tutulmadığı için dönemsel aktif/pasif değerler
   * "dönem içinde oluşturulmuş ve bugün bu durumda olan" kayıtları sayar.
   */
  private metricDefinitions(): Record<
    DashboardMetricKey,
    DashboardMetricDefinition
  > {
    return {
      orders: {
        query: (createdAt) => this.prisma.order.count({ where: { createdAt } }),
      },
      grossSales: {
        query: (createdAt) =>
          this.prisma.order.aggregate({
            _sum: { totalAmount: true },
            where: { createdAt, status: { in: REALIZED_ORDER_STATUSES } },
          }),
        toValue: sumOf("totalAmount"),
      },
      commissionRevenue: {
        query: (createdAt) =>
          this.prisma.order.aggregate({
            _sum: { commissionAmount: true },
            where: { createdAt, status: { in: REALIZED_ORDER_STATUSES } },
          }),
        toValue: sumOf("commissionAmount"),
      },
      netCommission: {
        query: (createdAt) =>
          this.prisma.commissionLedger.aggregate({
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
          }),
        // TEK formül (ledgerNetRevenue) — finans özetiyle aynı kaynak.
        // Stopaj satıcının vergi/payout akışına ait; platform geliri değil.
        toValue: (raw) => ledgerNetRevenue((raw as LedgerAggregate)._sum),
      },
      activeProducts: {
        query: (createdAt) =>
          this.prisma.product.count({
            where: {
              kind: ProductKind.listing,
              createdAt,
              status: ProductStatus.active,
            },
          }),
      },
      passiveProducts: {
        query: (createdAt) =>
          this.prisma.product.count({
            where: {
              kind: ProductKind.listing,
              createdAt,
              status: { in: [ProductStatus.inactive, ProductStatus.suspended] },
            },
          }),
      },
      activeUsers: {
        query: (createdAt) =>
          this.prisma.user.count({
            where: { createdAt, isBanned: false, deletedAt: null },
          }),
      },
      passiveUsers: {
        query: (createdAt) =>
          this.prisma.user.count({
            where: {
              createdAt,
              OR: [{ isBanned: true }, { deletedAt: { not: null } }],
            },
          }),
      },
      cancellations: {
        query: (createdAt) =>
          this.prisma.order.count({
            where: { createdAt, status: OrderStatus.cancelled },
          }),
      },
      refunds: {
        query: (createdAt) =>
          this.prisma.refundRequest.count({ where: { createdAt } }),
      },
      visitors: {
        // DİKKAT — ölçülen şey "ziyaretçi" değil: `lastActivityAt` yalnız
        // BAŞARILI GİRİŞTE damgalanıyor (auth/utils/login-stamp.ts), yani bu
        // sayı "son girişi bu pencereye düşen kayıtlı kullanıcı" demek.
        // Anonim trafik hiçbir yerde ölçülmüyor; gerçek ziyaretçi metriği için
        // ayrı bir sayfa-görüntüleme/oturum hattı gerekir.
        // Bir de: tek bir "son" damga tutulduğu için, iki dönemde de aktif olan
        // kullanıcı yalnız SONRAKİ pencerede sayılır — geçmiş pencereler
        // olduğundan düşük görünür.
        query: (lastActivityAt) =>
          this.prisma.user.count({
            where: { lastActivityAt: lastActivityAt ?? { not: null } },
          }),
      },
    };
  }

  /**
   * Save analytics snapshot
   */
  async saveAnalyticsSnapshot() {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const [
      totalUsers,
      totalProducts,
      totalOrders,
      commission,
      newUsers,
      newOrders,
    ] = await this.prisma.$transaction([
      this.prisma.user.count(),
      this.prisma.product.count({ where: { kind: ProductKind.listing } }),
      this.prisma.order.count(),
      this.prisma.order.aggregate({
        _sum: { commissionAmount: true },
        where: { status: { in: REALIZED_ORDER_STATUSES } },
      }),
      this.prisma.user.count({ where: { createdAt: { gte: sevenDaysAgo } } }),
      this.prisma.order.count({ where: { createdAt: { gte: sevenDaysAgo } } }),
    ]);

    const stats = await this.getDashboardStats({ period: "monthly" });

    return this.prisma.analyticsSnapshot.create({
      data: {
        snapshotType: "daily",
        snapshotDate: new Date(),
        totalUsers,
        totalProducts,
        totalOrders,
        totalRevenue: Number(commission._sum.commissionAmount ?? 0),
        newUsers,
        newOrders,
        data: stats as unknown as Prisma.InputJsonValue,
      },
    });
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
        where: {
          kind: ProductKind.listing,
          createdAt: { gte: startDate, lte: endDate },
        },
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
      where: { kind: ProductKind.listing },
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
        _count: {
          select: {
            products: { where: { kind: ProductKind.listing } },
          },
        },
      },
    });

    const sellerIds = sellers.map((s) => s.id);
    const activeCounts = sellerIds.length
      ? await this.prisma.product.groupBy({
          by: ["sellerId"],
          where: {
            kind: ProductKind.listing,
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
        this.prisma.product.count({
          where: { kind: ProductKind.listing, status: ProductStatus.pending },
        }),
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
      // Paranın tam dağılımı: platformda kalan ücretler, devlete giden vergi,
      // taşıyıcıya giden kargo ve bunların oranlandığı ürün cirosu. Ekran
      // "Tarodan'a ne kaldı" sorusunu ancak dördü birlikte yanıtlayabiliyor.
      this.prisma.order.aggregate({
        _sum: {
          buyerFeeAmount: true,
          sellerFeeAmount: true,
          subtotal: true,
          buyerServiceTaxAmount: true,
          sellerServiceTaxAmount: true,
          withholdingTaxAmount: true,
          buyerShippingAmount: true,
          sellerShippingAmount: true,
        },
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
      // Ürün cirosu (GMV) — Tarodan payının oranlandığı taban.
      totalSubtotal: Number(totalFees._sum.subtotal || 0),
      // Devlete giden: iki taraf hizmet KDV'si + stopaj.
      totalTax:
        Number(totalFees._sum.buyerServiceTaxAmount || 0) +
        Number(totalFees._sum.sellerServiceTaxAmount || 0) +
        Number(totalFees._sum.withholdingTaxAmount || 0),
      // Taşıyıcıya giden: iki tarafın kargo payı.
      totalShipping:
        Number(totalFees._sum.buyerShippingAmount || 0) +
        Number(totalFees._sum.sellerShippingAmount || 0),
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
