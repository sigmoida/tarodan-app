import { Injectable, NotFoundException, Logger } from "@nestjs/common";
import { PrismaService } from "../../prisma";
import { OrderStatus, ProductStatus } from "@prisma/client";
import { i18nMessage } from "../i18n";
import {
  effectiveMembershipTierType,
  isBusinessMembershipEntitled,
} from "../membership/membership.util";

/**
 * UserStatsService — özet istatistikler: isBusinessAccount,
 * getSellerSummaryStats, getMyStats. Ağır analitik (getUserAnalytics /
 * getBusinessDashboardStats) ayrı UserAnalyticsService'te.
 */
@Injectable()
export class UserStatsService {
  private readonly logger = new Logger(UserStatsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Check whether the user has an effective, KYC-approved Business account. */
  async isBusinessAccount(userId: string): Promise<boolean> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        membership: {
          include: { tier: true },
        },
      },
    });

    if (!user) return false;

    return isBusinessMembershipEntitled(user.membership, user);
  }

  /**
   * Satıcı panosu özet istatistikleri (her satıcı için).
   * Toplam gelir: ödemesi alınmış ve iptal/iade edilmemiş siparişler (pending_payment
   * ve cancelled/refunded hariç) → bir satış yapıldığında gelir hemen görünür.
   */
  async getSellerSummaryStats(userId: string) {
    const REVENUE_STATUSES: OrderStatus[] = [
      OrderStatus.paid,
      OrderStatus.preparing,
      OrderStatus.shipped,
      OrderStatus.delivered,
      OrderStatus.awaiting_buyer_confirmation,
      OrderStatus.completed,
    ];

    const [revenue, soldOrdersCount, activeProductsCount, followersCount] =
      await Promise.all([
        this.prisma.order.aggregate({
          where: { sellerId: userId, status: { in: REVENUE_STATUSES } },
          _sum: { totalAmount: true },
        }),
        this.prisma.order.count({
          where: { sellerId: userId, status: { in: REVENUE_STATUSES } },
        }),
        this.prisma.product.count({
          where: { sellerId: userId, status: ProductStatus.active },
        }),
        this.prisma.userFollow.count({ where: { followingId: userId } }),
      ]);

    return {
      totalRevenue: Number(revenue._sum.totalAmount || 0),
      soldProductsCount: soldOrdersCount,
      activeProductsCount,
      followersCount,
    };
  }

  /**
   * Get user analytics data
   * Available for all authenticated users
   */
  /**
   * Kullanıcının özet istatistikleri — İstatistikler sayfasının tek veri
   * kaynağı. "Satış/harcama" için ödemesi alınmış tüm siparişler sayılır
   * (paid → completed); yalnızca completed/delivered sayılırsa kargo
   * sürecindeki siparişler 0 olarak görünür.
   */
  async getMyStats(userId: string) {
    const PAID_STATUSES = [
      "paid",
      "preparing",
      "shipped",
      "delivered",
      "awaiting_buyer_confirmation",
      "completed",
    ] as const;

    // "Satıldı" ürün durumundan (sold) DEĞİL, ödemesi alınmış SATIŞ SİPARİŞİNDEN
    // türetilir — çünkü seed/eski veride satılmış ürünler 'active' kalmış olabilir.
    // Böylece "1465 TL kazanç ama 0 satış" tutarsızlığı oluşmaz.
    const [
      user,
      productsCount,
      activeProductsCount,
      soldProductsCount,
      viewsAgg,
      likesAgg,
      ordersCount,
      completedOrdersCount,
      purchasesCount,
      salesCount,
      spentAgg,
      revenueAgg,
      tradesCount,
      successfulTradesCount,
      collectionsCount,
      ratingAgg,
      followersCount,
      followingCount,
    ] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: userId },
        select: {
          createdAt: true,
          companyName: true,
          taxId: true,
          businessStatus: true,
          membership: {
            select: {
              status: true,
              currentPeriodEnd: true,
              tier: { select: { type: true, isActive: true } },
            },
          },
        },
      }),
      this.prisma.product.count({
        where: { sellerId: userId, status: { notIn: ["deleted"] } },
      }),
      // Gerçekten satılabilir aktif ilan = active VE ödenmiş satış siparişi YOK
      this.prisma.product.count({
        where: {
          sellerId: userId,
          status: "active",
          orders: { none: { status: { in: [...PAID_STATUSES] } } },
        },
      }),
      // Satılmış ilan = en az bir ödenmiş satış siparişi OLAN farklı ürün sayısı
      this.prisma.product.count({
        where: {
          sellerId: userId,
          status: { notIn: ["deleted"] },
          orders: { some: { status: { in: [...PAID_STATUSES] } } },
        },
      }),
      this.prisma.product.aggregate({
        where: { sellerId: userId },
        _sum: { viewCount: true },
      }),
      this.prisma.product.aggregate({
        where: { sellerId: userId },
        _sum: { likeCount: true },
      }),
      // "Siparişlerim" sayacı, listeyle (order.service.ts findUserOrders) tutarlı
      // olmalı: üyelik/boost sanal siparişleri liste DIŞLADIĞI için sayaç da hariç
      // tutmalı. Aksi halde şirket üyelik alınca sayaç 1, liste boş görünür.
      this.prisma.order.count({
        where: {
          buyerId: userId,
          NOT: {
            OR: [
              { productId: { startsWith: "membership-" } },
              { productId: { startsWith: "boost-" } },
            ],
          },
        },
      }),
      this.prisma.order.count({
        where: { buyerId: userId, status: { in: ["delivered", "completed"] } },
      }),
      // Harcama yapılan (ödemesi alınmış) alıcı siparişi sayısı
      this.prisma.order.count({
        where: { buyerId: userId, status: { in: [...PAID_STATUSES] } },
      }),
      // Yapılan satış (ödemesi alınmış satıcı siparişi) sayısı
      this.prisma.order.count({
        where: { sellerId: userId, status: { in: [...PAID_STATUSES] } },
      }),
      this.prisma.order.aggregate({
        where: { buyerId: userId, status: { in: [...PAID_STATUSES] } },
        _sum: { totalAmount: true },
      }),
      this.prisma.order.aggregate({
        where: { sellerId: userId, status: { in: [...PAID_STATUSES] } },
        _sum: { totalAmount: true },
      }),
      this.prisma.trade.count({
        where: { OR: [{ initiatorId: userId }, { receiverId: userId }] },
      }),
      this.prisma.trade.count({
        where: {
          OR: [{ initiatorId: userId }, { receiverId: userId }],
          status: "completed",
        },
      }),
      this.prisma.collection.count({ where: { userId } }),
      this.prisma.rating.aggregate({
        where: { receiverId: userId, status: "approved" },
        _avg: { score: true },
        _count: true,
      }),
      // Takipçi/takip sayıları — getPublicProfile ile birebir aynı sayım (line ~814)
      // Böylece kullanıcı kendi profilinde de doğru takipçi sayısını görür.
      this.prisma.userFollow.count({ where: { followingId: userId } }),
      this.prisma.userFollow.count({ where: { followerId: userId } }),
    ]);

    if (!user) {
      throw new NotFoundException(i18nMessage("server.user.notFound"));
    }

    return {
      productsCount,
      activeProductsCount,
      soldProductsCount,
      ordersCount,
      completedOrdersCount,
      purchasesCount,
      salesCount,
      tradesCount,
      successfulTradesCount,
      collectionsCount,
      followersCount,
      followingCount,
      totalViews: viewsAgg._sum.viewCount || 0,
      totalFavorites: likesAgg._sum.likeCount || 0,
      rating: ratingAgg._avg?.score || 0,
      reviewsCount: ratingAgg._count || 0,
      totalRevenue: Number(revenueAgg._sum.totalAmount || 0),
      totalSpent: Number(spentAgg._sum.totalAmount || 0),
      memberSince: user.createdAt,
      membershipTier: effectiveMembershipTierType(user.membership, user),
    };
  }
}
