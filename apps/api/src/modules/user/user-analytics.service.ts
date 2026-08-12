import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger,
  Optional,
} from "@nestjs/common";
import { PrismaService } from "../../prisma";
import { StorageService } from "../storage/storage.service";
import { UserCommonService } from "./user-common.service";
import {
  isBusinessMembershipEntitled,
  isPremiumEntitled,
} from "../membership/membership.util";
import { i18nMessage } from "../i18n";
import {
  PUBLIC_NAME_SELECT,
  publicName,
} from "../../common/helpers/public-identity";

/**
 * UserAnalyticsService — ağır analitik: getUserAnalytics (dönemsel satış/
 * görüntülenme/kategori) ve getBusinessDashboardStats (işletme panosu). Ürün/
 * avatar görsel çözümü için common'a delege eder; kapak URL'i için @Optional
 * StorageService'i doğrudan kullanır (davranış korunur).
 */
@Injectable()
export class UserAnalyticsService {
  private readonly logger = new Logger(UserAnalyticsService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Optional()
    private readonly storageService: StorageService,
    private readonly common: UserCommonService,
  ) {}

  async getUserAnalytics(userId: string, period: "7d" | "30d" | "90d" = "30d") {
    // Analytics is a paid (premium/business) feature — gate at the source so a free
    // user cannot call the endpoint directly (the web merely hides the UI). Entitlement
    // uses the single source of truth: an active, in-period paid membership.
    const membership = await this.prisma.userMembership.findUnique({
      where: { userId },
      include: {
        tier: true,
        user: {
          select: {
            businessStatus: true,
            companyName: true,
            taxId: true,
          },
        },
      },
    });
    if (!isPremiumEntitled(membership, membership?.user)) {
      throw new ForbiddenException(
        i18nMessage("server.membership.premiumFeatureOnly"),
      );
    }

    const now = new Date();
    const daysMap = { "7d": 7, "30d": 30, "90d": 90 };
    const days = daysMap[period];
    const periodStart = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
    const previousPeriodStart = new Date(
      periodStart.getTime() - days * 24 * 60 * 60 * 1000,
    );

    // Satış = ödemesi alınmış sipariş (paid → completed). Yalnızca
    // completed/delivered sayılırsa kargo sürecindeki satışlar 0 görünür
    // (detaylı analiz/admin tarafıyla tutarsızlık).
    const SOLD_STATUSES = [
      "paid",
      "preparing",
      "shipped",
      "delivered",
      "awaiting_buyer_confirmation",
      "completed",
    ];

    // Get current period stats
    const [
      totalViews,
      totalLikes,
      totalSalesCount,
      totalRevenue,
      activeListings,
      pendingOrders,
      allTimeSalesCount,
      // Previous period for comparison
      prevPeriodLikes,
      currentPeriodLikes,
      prevSalesCount,
      prevRevenue,
    ] = await Promise.all([
      // Current period
      this.prisma.product.aggregate({
        where: { sellerId: userId },
        _sum: { viewCount: true },
      }),
      this.prisma.product.aggregate({
        where: { sellerId: userId },
        _sum: { likeCount: true },
      }),
      this.prisma.order.count({
        where: {
          sellerId: userId,
          status: { in: SOLD_STATUSES as any },
          createdAt: { gte: periodStart },
        },
      }),
      this.prisma.order.aggregate({
        where: {
          sellerId: userId,
          status: { in: SOLD_STATUSES as any },
          createdAt: { gte: periodStart },
        },
        _sum: { totalAmount: true },
      }),
      this.prisma.product.count({
        where: { sellerId: userId, status: "active" },
      }),
      this.prisma.order.count({
        where: {
          sellerId: userId,
          status: { in: ["pending_payment", "paid", "preparing"] },
        },
      }),
      this.prisma.order.count({
        where: {
          sellerId: userId,
          status: { in: SOLD_STATUSES as any },
        },
      }),
      // Previous period for comparison
      this.prisma.productLike.count({
        where: {
          product: { sellerId: userId },
          createdAt: { gte: previousPeriodStart, lt: periodStart },
        },
      }),
      this.prisma.productLike.count({
        where: {
          product: { sellerId: userId },
          createdAt: { gte: periodStart },
        },
      }),
      this.prisma.order.count({
        where: {
          sellerId: userId,
          status: { in: SOLD_STATUSES as any },
          createdAt: { gte: previousPeriodStart, lt: periodStart },
        },
      }),
      this.prisma.order.aggregate({
        where: {
          sellerId: userId,
          status: { in: SOLD_STATUSES as any },
          createdAt: { gte: previousPeriodStart, lt: periodStart },
        },
        _sum: { totalAmount: true },
      }),
    ]);

    // Calculate change percentages
    const calcChange = (current: number, previous: number) => {
      if (previous === 0) return current > 0 ? 100 : 0;
      return ((current - previous) / previous) * 100;
    };

    const currentViews = totalViews._sum.viewCount || 0;
    const currentLikes = totalLikes._sum.likeCount || 0;
    const currentRevenue = Number(totalRevenue._sum.totalAmount || 0);
    const previousRevenue = Number(prevRevenue._sum.totalAmount || 0);

    // Get top products
    const topProducts = await this.prisma.product.findMany({
      where: { sellerId: userId },
      orderBy: { viewCount: "desc" },
      take: 5,
      select: {
        id: true,
        title: true,
        viewCount: true,
        likeCount: true,
        price: true,
        status: true,
        images: { take: 1, select: { cardKey: true } },
      },
    });

    // Get daily views for chart (approximate from products updated)
    const dailyViews: { date: string; views: number; favorites: number }[] = [];
    for (let i = Math.min(days, 14) - 1; i >= 0; i--) {
      const date = new Date(now);
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split("T")[0];

      // Get likes for that day
      const dayStart = new Date(dateStr);
      const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);

      const dayLikes = await this.prisma.productLike.count({
        where: {
          product: { sellerId: userId },
          createdAt: { gte: dayStart, lt: dayEnd },
        },
      });

      // Views are only stored as a cumulative counter; approximate the daily
      // breakdown from that day's likes and the overall views-per-like ratio
      const avgViewsPerLike =
        currentViews > 0 && currentLikes > 0
          ? Math.round(currentViews / currentLikes)
          : 0;

      dailyViews.push({
        date: dateStr,
        views: dayLikes * avgViewsPerLike,
        favorites: dayLikes,
      });
    }

    // Get recent activity
    const [recentOrders, recentLikes, recentMessages] = await Promise.all([
      this.prisma.order.findMany({
        where: { sellerId: userId },
        orderBy: { createdAt: "desc" },
        take: 3,
        select: {
          id: true,
          status: true,
          totalAmount: true,
          createdAt: true,
          product: { select: { title: true } },
          buyer: { select: PUBLIC_NAME_SELECT },
        },
      }),
      this.prisma.productLike.findMany({
        where: { product: { sellerId: userId } },
        orderBy: { createdAt: "desc" },
        take: 3,
        select: {
          createdAt: true,
          product: { select: { title: true } },
          user: { select: PUBLIC_NAME_SELECT },
        },
      }),
      this.prisma.message.findMany({
        where: {
          receiverId: userId,
        },
        orderBy: { createdAt: "desc" },
        take: 2,
        select: {
          createdAt: true,
          threadId: true,
          sender: { select: PUBLIC_NAME_SELECT },
        },
      }),
    ]);

    // Get product titles for messages (if linked to a product thread)
    const messageProductTitles = await Promise.all(
      recentMessages.map(async (m) => {
        const thread = await this.prisma.messageThread.findUnique({
          where: { id: m.threadId },
          select: { productId: true },
        });
        if (thread?.productId) {
          const product = await this.prisma.product.findUnique({
            where: { id: thread.productId },
            select: { title: true },
          });
          return product?.title || "Ürün";
        }
        return "Mesaj";
      }),
    );

    const recentActivity = [
      ...recentOrders.map((o) => ({
        type: "sale" as const,
        productTitle: o.product?.title || "Ürün",
        timestamp: o.createdAt.toISOString(),
        amount: Number(o.totalAmount),
        userDisplayName: publicName(o.buyer),
      })),
      ...recentLikes.map((l) => ({
        type: "favorite" as const,
        productTitle: l.product?.title || "Ürün",
        timestamp: l.createdAt.toISOString(),
        userDisplayName: publicName(l.user),
      })),
      ...recentMessages.map((m, i) => ({
        type: "message" as const,
        productTitle: messageProductTitles[i],
        timestamp: m.createdAt.toISOString(),
        userDisplayName: publicName(m.sender),
      })),
    ]
      .sort(
        (a, b) =>
          new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
      )
      .slice(0, 6);

    // Get category stats
    const categoryStats = await this.prisma.product.groupBy({
      by: ["categoryId"],
      where: { sellerId: userId },
      _count: { id: true },
      _sum: { viewCount: true },
    });

    const categories = await this.prisma.category.findMany({
      where: {
        id: {
          in: categoryStats
            .map((c) => c.categoryId)
            .filter(Boolean) as string[],
        },
      },
      select: { id: true, name: true },
    });

    const salesByCategory = await Promise.all(
      categoryStats.map(async (cat) => {
        const sales = await this.prisma.order.count({
          where: {
            sellerId: userId,
            product: { categoryId: cat.categoryId },
            status: { in: SOLD_STATUSES as any },
          },
        });
        return { categoryId: cat.categoryId, sales };
      }),
    );

    const formattedCategoryStats = categoryStats
      .map((cat) => {
        const category = categories.find((c) => c.id === cat.categoryId);
        const sales =
          salesByCategory.find((s) => s.categoryId === cat.categoryId)?.sales ||
          0;
        return {
          name: category?.name || "Diğer",
          listings: cat._count.id,
          views: cat._sum.viewCount || 0,
          sales,
        };
      })
      .sort((a, b) => b.views - a.views);

    // Calculate additional metrics
    const avgViewsPerListing =
      activeListings > 0 ? Math.round(currentViews / activeListings) : 0;
    // Views are an all-time counter, so compare against all-time sales
    const conversionRate =
      currentViews > 0 ? (allTimeSalesCount / currentViews) * 100 : 0;

    // Average time to sell (estimate)
    const soldProducts = await this.prisma.product.findMany({
      where: {
        sellerId: userId,
        status: "sold",
        updatedAt: { gte: periodStart },
      },
      select: { createdAt: true, updatedAt: true },
      take: 10,
    });

    const avgTimeToSell =
      soldProducts.length > 0
        ? Math.round(
            soldProducts.reduce(
              (sum, p) =>
                sum +
                (p.updatedAt.getTime() - p.createdAt.getTime()) /
                  (1000 * 60 * 60 * 24),
              0,
            ) / soldProducts.length,
          )
        : 0;

    return {
      totalViews: currentViews,
      totalFavorites: currentLikes,
      totalSales: totalSalesCount,
      totalRevenue: currentRevenue,
      activeListings,
      pendingOrders,
      // Views aren't tracked per day, so likes act as a proxy for the views trend
      viewsChange: calcChange(currentPeriodLikes, prevPeriodLikes),
      favoritesChange: calcChange(currentPeriodLikes, prevPeriodLikes),
      salesChange: calcChange(totalSalesCount, prevSalesCount),
      revenueChange: calcChange(currentRevenue, previousRevenue),
      avgViewsPerListing,
      conversionRate: Math.round(conversionRate * 100) / 100,
      avgTimeToSell,
      repeatCustomerRate: 0, // Would need more complex query
      topProducts: topProducts.map((p) => ({
        id: p.id,
        title: p.title,
        views: p.viewCount,
        favorites: p.likeCount,
        price: Number(p.price),
        status: p.status,
        imageUrl: this.common.resolveProductImageUrl(p.images[0]?.cardKey),
      })),
      dailyViews,
      recentActivity,
      categoryStats: formattedCategoryStats,
    };
  }

  /**
   * Get business dashboard statistics
   * Only for business accounts
   */
  async getBusinessDashboardStats(userId: string) {
    // Verify user is a business account
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        membership: {
          include: { tier: true },
        },
      },
    });

    if (!user) {
      throw new NotFoundException(i18nMessage("server.user.notFound"));
    }

    if (!isBusinessMembershipEntitled(user.membership, user)) {
      throw new BadRequestException(
        i18nMessage("server.user.businessFeatureOnly"),
      );
    }

    // Get date ranges
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    // Get product stats
    const [
      totalProducts,
      activeProducts,
      totalViews,
      totalLikes,
      totalSales,
      revenue,
      recentViews,
      recentLikes,
    ] = await Promise.all([
      // Total products excluding inactive and deleted
      this.prisma.product.count({
        where: {
          sellerId: userId,
          status: { notIn: ["inactive", "deleted"] },
        },
      }),
      this.prisma.product.count({
        where: { sellerId: userId, status: "active" },
      }),
      this.prisma.product.aggregate({
        where: { sellerId: userId },
        _sum: { viewCount: true },
      }),
      this.prisma.product.aggregate({
        where: { sellerId: userId },
        _sum: { likeCount: true },
      }),
      this.prisma.order.count({
        where: { sellerId: userId, status: "completed" },
      }),
      this.prisma.order.aggregate({
        where: { sellerId: userId, status: { in: ["completed", "delivered"] } },
        _sum: { totalAmount: true },
      }),
      // Recent views (7 days) - approximation using product view counts
      this.prisma.product.aggregate({
        where: { sellerId: userId, updatedAt: { gte: sevenDaysAgo } },
        _sum: { viewCount: true },
      }),
      // Recent likes (7 days)
      this.prisma.productLike.count({
        where: {
          product: { sellerId: userId },
          createdAt: { gte: sevenDaysAgo },
        },
      }),
    ]);

    // Get collection stats
    const [totalCollections, collectionViews, collectionLikes] =
      await Promise.all([
        this.prisma.collection.count({ where: { userId } }),
        this.prisma.collection.aggregate({
          where: { userId },
          _sum: { viewCount: true },
        }),
        this.prisma.collection.aggregate({
          where: { userId },
          _sum: { likeCount: true },
        }),
      ]);

    // Get top products by views
    const topProductsByViews = await this.prisma.product.findMany({
      where: { sellerId: userId, status: "active" },
      orderBy: { viewCount: "desc" },
      take: 5,
      select: {
        id: true,
        title: true,
        viewCount: true,
        likeCount: true,
        price: true,
        images: { take: 1, select: { cardKey: true } },
      },
    });

    // Get top products by likes
    const topProductsByLikes = await this.prisma.product.findMany({
      where: { sellerId: userId, status: "active" },
      orderBy: { likeCount: "desc" },
      take: 5,
      select: {
        id: true,
        title: true,
        viewCount: true,
        likeCount: true,
        price: true,
        images: { take: 1, select: { cardKey: true } },
      },
    });

    // Get top collections
    const topCollections = await this.prisma.collection.findMany({
      where: { userId, isPublic: true },
      orderBy: [{ viewCount: "desc" }, { likeCount: "desc" }],
      take: 5,
      select: {
        id: true,
        name: true,
        viewCount: true,
        likeCount: true,
        coverImageKey: true,
        _count: { select: { items: true } },
      },
    });

    return {
      overview: {
        totalProducts,
        activeProducts,
        totalViews: totalViews._sum.viewCount || 0,
        totalLikes: totalLikes._sum.likeCount || 0,
        totalSales,
        totalRevenue: Number(revenue._sum.totalAmount || 0),
        totalCollections,
        collectionViews: collectionViews._sum.viewCount || 0,
        collectionLikes: collectionLikes._sum.likeCount || 0,
      },
      weekly: {
        views: recentViews._sum.viewCount || 0,
        likes: recentLikes,
      },
      topProducts: {
        byViews: topProductsByViews.map((p) => ({
          id: p.id,
          title: p.title,
          viewCount: p.viewCount,
          likeCount: p.likeCount,
          price: Number(p.price),
          image: this.common.resolveProductImageUrl(p.images[0]?.cardKey),
        })),
        byLikes: topProductsByLikes.map((p) => ({
          id: p.id,
          title: p.title,
          viewCount: p.viewCount,
          likeCount: p.likeCount,
          price: Number(p.price),
          image: this.common.resolveProductImageUrl(p.images[0]?.cardKey),
        })),
      },
      topCollections: topCollections.map((c) => ({
        id: c.id,
        name: c.name,
        viewCount: c.viewCount,
        likeCount: c.likeCount,
        coverImage: c.coverImageKey
          ? this.storageService.getPublicAssetUrl(c.coverImageKey)
          : undefined,
        itemCount: c._count.items,
      })),
      company: {
        name: user.companyName,
        displayName: user.displayName,
        avatarUrl: await this.common.resolveAvatarUrl(user.avatarUrl),
        isVerified: user.isVerified,
      },
    };
  }
}
