import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Optional,
} from "@nestjs/common";
import { PrismaService } from "../../prisma";
import { StorageService } from "../storage/storage.service";
import { AdminAuditService } from "./admin-audit.service";
import { fulltextUserSearch } from "../../common/helpers/fulltext-search";
import { AdminUserQueryDto } from "./dto";
import { Prisma, MembershipTierType, SubscriptionStatus } from "@prisma/client";
import {
  ADMIN_LIST_DEFAULT_LIMIT,
  ADMIN_LIST_DEFAULT_PAGE,
  ADMIN_LIST_MAX_LIMIT,
  dateRangeWhere,
  paginate,
  resolveOrderBy,
} from "../../common/list";

/**
 * Kullanıcı yönetimi + admin üyelik override'ları — AdminService'in
 * USER MANAGEMENT ve ADMIN: KULLANICI ÜYELİĞİ bölümlerinden birebir taşındı.
 * AdminService aynı imzalarla buraya delege eder.
 */
@Injectable()
export class AdminUserService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AdminAuditService,
    @Optional()
    private readonly storageService: StorageService,
  ) {}

  // AdminService'teki leaf yardımcı ile birebir aynı (bilinçli kopya; facade'da
  // başka bölümler de kullandığı için oradan kaldırılamadı).
  private resolveProductImageUrl(
    imageKeyOrUrl: string | null | undefined,
  ): string | null {
    if (!imageKeyOrUrl) return null;
    // Strip expired presigned S3 query params to get the clean public URL
    if (
      (imageKeyOrUrl.startsWith("http://") ||
        imageKeyOrUrl.startsWith("https://")) &&
      imageKeyOrUrl.includes("X-Amz-Signature")
    ) {
      try {
        const parsed = new URL(imageKeyOrUrl);
        parsed.search = "";
        return parsed.toString();
      } catch {
        // fall through
      }
    }
    if (
      imageKeyOrUrl.startsWith("http://") ||
      imageKeyOrUrl.startsWith("https://") ||
      imageKeyOrUrl.startsWith("/")
    )
      return imageKeyOrUrl;
    // Try to resolve any non-URL string as an S3 key (covers dev/, prod/, and other prefixes)
    if (this.storageService) {
      return this.storageService.getPublicAssetUrl(imageKeyOrUrl) ?? null;
    }
    return null;
  }

  // ==================== USER MANAGEMENT ====================

  /**
   * Get users with filters
   */
  async getUsers(query: AdminUserQueryDto) {
    const { search, isSeller, isVerified } = query;

    const where: Prisma.UserWhereInput = {};

    if (search) {
      const userIds = await fulltextUserSearch(this.prisma, search);
      if (userIds.length === 0) {
        return {
          data: [],
          meta: {
            total: 0,
            page: query.page ?? 1,
            limit: query.limit ?? 20,
            totalPages: 0,
          },
        };
      }
      where.id = { in: userIds };
    }

    if (isSeller !== undefined) {
      where.isSeller = isSeller;
    }

    if (isVerified !== undefined) {
      where.isVerified = isVerified;
    }

    if (query.isBanned === true) {
      where.isBanned = true;
    }

    // Membership lifecycle filters (tier / status / "expiring soon"). All narrow
    // the to-one membership relation, so they compose within a single relation
    // filter (implicitly AND-ed).
    const membershipWhere: Prisma.UserMembershipWhereInput = {};
    if (query.membershipStatus) {
      membershipWhere.status = query.membershipStatus;
    }
    if (query.expiringInDays && query.expiringInDays > 0) {
      const until = new Date();
      until.setDate(until.getDate() + query.expiringInDays);
      membershipWhere.currentPeriodEnd = { gte: new Date(), lte: until };
    }
    if (query.membershipTier) {
      membershipWhere.tier = { type: query.membershipTier };
    } else if (query.expiringInDays && query.expiringInDays > 0) {
      // "Expiring" only makes sense for paid tiers — a free plan never lapses.
      membershipWhere.tier = { type: { not: MembershipTierType.free } };
    }
    if (Object.keys(membershipWhere).length > 0) {
      where.membership = membershipWhere;
    }

    // Registration date-range filter — wires the table's DateRange control
    // (previously a no-op on this endpoint) to the user's `createdAt`.
    Object.assign(where, dateRangeWhere(query));

    const select = {
      id: true,
      adminCode: true,
      username: true,
      email: true,
      displayName: true,
      phone: true,
      isSeller: true,
      sellerType: true,
      isVerified: true,
      isBanned: true,
      createdAt: true,
      lastLoginAt: true,
      lastActivityAt: true,
      membership: {
        select: {
          status: true,
          currentPeriodEnd: true,
          tier: {
            select: {
              type: true,
              name: true,
            },
          },
        },
      },
      _count: {
        select: {
          products: true,
          buyerOrders: true,
          sellerOrders: true,
          initiatedTrades: true,
          receivedTrades: true,
          refundRequests: true,
        },
      },
    } satisfies Prisma.UserSelect;

    // `ordersCount` on the general users table is buyerOrders + sellerOrders,
    // which Prisma cannot express as a relation aggregate orderBy. Resolve that
    // one computed column against the complete filtered ID/count set, then fetch
    // only the requested page. Seller performance uses sellerOrders alone.
    if (query.sortBy === "ordersCount" && isSeller !== true) {
      const page = Math.max(
        ADMIN_LIST_DEFAULT_PAGE,
        Math.floor(query.page ?? ADMIN_LIST_DEFAULT_PAGE),
      );
      const limit = Math.min(
        ADMIN_LIST_MAX_LIMIT,
        Math.max(1, Math.floor(query.limit ?? ADMIN_LIST_DEFAULT_LIMIT)),
      );
      const counts = await this.prisma.user.findMany({
        where,
        select: {
          id: true,
          _count: { select: { buyerOrders: true, sellerOrders: true } },
        },
      });
      const factor = query.sortOrder === "asc" ? 1 : -1;
      counts.sort((left, right) => {
        const leftTotal = left._count.buyerOrders + left._count.sellerOrders;
        const rightTotal = right._count.buyerOrders + right._count.sellerOrders;
        return (
          (leftTotal - rightTotal) * factor || left.id.localeCompare(right.id)
        );
      });

      const pageIds = counts
        .slice((page - 1) * limit, page * limit)
        .map(({ id }) => id);
      const rows = pageIds.length
        ? await this.prisma.user.findMany({
            where: { ...where, id: { in: pageIds } },
            select,
          })
        : [];
      const position = new Map(pageIds.map((id, index) => [id, index]));
      rows.sort(
        (left, right) =>
          (position.get(left.id) ?? 0) - (position.get(right.id) ?? 0),
      );

      return {
        data: await this.attachCancelledCounts(rows),
        meta: {
          total: counts.length,
          page,
          limit,
          totalPages: Math.ceil(counts.length / limit),
        },
      };
    }

    const orderBy = resolveOrderBy<
      | Prisma.UserOrderByWithRelationInput
      | Prisma.UserOrderByWithRelationInput[]
    >("User", query, {
      defaultSort: [
        { lastLoginAt: { sort: "desc", nulls: "last" } },
        { createdAt: "desc" },
      ],
      sortMap: {
        lastLoginAt: (direction) => ({
          lastLoginAt: { sort: direction, nulls: "last" },
        }),
        "_count.products": (direction) => ({
          products: { _count: direction },
        }),
        "_count.sellerOrders": (direction) => ({
          sellerOrders: { _count: direction },
        }),
        // Backward-compatible alias used by the general users table.
        ordersCount: (direction) => ({
          sellerOrders: { _count: direction },
        }),
        // Membership columns (tier / status / expiry) sort through the to-one
        // membership relation.
        "membership.tier.type": (direction) => ({
          membership: { tier: { type: direction } },
        }),
        "membership.status": (direction) => ({
          membership: { status: direction },
        }),
        "membership.currentPeriodEnd": (direction) => ({
          membership: { currentPeriodEnd: direction },
        }),
      },
    });

    const result = await paginate(
      this.prisma.user,
      {
        where,
        select,
        orderBy,
      },
      query,
    );
    return {
      ...result,
      data: await this.attachCancelledCounts(result.data),
    };
  }

  /**
   * Attach a `cancelledOrdersCount` to each user row (cancelled orders where the
   * user is buyer or seller). Prisma's `_count` can't filter by status alongside
   * the unfiltered order counts, so this is a separate grouped query per page.
   */
  private async attachCancelledCounts<T extends { id: string }>(
    rows: T[],
  ): Promise<(T & { cancelledOrdersCount: number })[]> {
    const ids = rows.map((r) => r.id);
    if (!ids.length)
      return rows.map((r) => ({ ...r, cancelledOrdersCount: 0 }));
    const [asBuyer, asSeller] = await Promise.all([
      this.prisma.order.groupBy({
        by: ["buyerId"],
        where: { status: "cancelled" as any, buyerId: { in: ids } },
        _count: { _all: true },
      }),
      this.prisma.order.groupBy({
        by: ["sellerId"],
        where: { status: "cancelled" as any, sellerId: { in: ids } },
        _count: { _all: true },
      }),
    ]);
    const map = new Map<string, number>();
    for (const g of asBuyer)
      map.set(g.buyerId, (map.get(g.buyerId) ?? 0) + g._count._all);
    for (const g of asSeller)
      map.set(g.sellerId, (map.get(g.sellerId) ?? 0) + g._count._all);
    return rows.map((r) => ({
      ...r,
      cancelledOrdersCount: map.get(r.id) ?? 0,
    }));
  }

  /**
   * Get user by ID with full details
   * Requirement: GET /admin/users/:id (project.txt)
   */
  async getUserById(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        addresses: true,
        products: {
          take: 10,
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            title: true,
            price: true,
            status: true,
            createdAt: true,
            images: { take: 1, select: { cardKey: true } },
          },
        },
        buyerOrders: {
          take: 10,
          orderBy: { createdAt: "desc" },
          include: {
            seller: { select: { id: true, displayName: true } },
            product: { select: { id: true, title: true } },
          },
        },
        sellerOrders: {
          take: 10,
          orderBy: { createdAt: "desc" },
          include: {
            buyer: { select: { id: true, displayName: true } },
            product: { select: { id: true, title: true } },
          },
        },
        initiatedTrades: {
          take: 10,
          orderBy: { createdAt: "desc" },
          include: {
            receiver: { select: { id: true, displayName: true } },
            items: {
              include: { product: { select: { id: true, title: true } } },
            },
          },
        },
        receivedTrades: {
          take: 10,
          orderBy: { createdAt: "desc" },
          include: {
            initiator: { select: { id: true, displayName: true } },
            items: {
              include: { product: { select: { id: true, title: true } } },
            },
          },
        },
        givenRatings: {
          take: 5,
          orderBy: { createdAt: "desc" },
          include: {
            receiver: { select: { id: true, displayName: true } },
          },
        },
        receivedRatings: {
          take: 5,
          orderBy: { createdAt: "desc" },
          include: {
            giver: { select: { id: true, displayName: true } },
          },
        },
        membership: {
          include: {
            tier: true,
          },
        },
        // Satıcı banka hesabı (IBAN) — admin görüntüleyebilsin. Hassas ama yalnız
        // admin endpoint'inde döner; maskeleme yok (admin tam görmeli).
        bankAccount: {
          select: {
            accountHolder: true,
            iban: true,
            tcKimlikNo: true,
            taxId: true,
            isVerified: true,
            verifiedAt: true,
          },
        },
        _count: {
          select: {
            products: true,
            buyerOrders: true,
            sellerOrders: true,
            givenRatings: true,
            receivedRatings: true,
            initiatedTrades: true,
            receivedTrades: true,
            sentMessages: true,
            receivedMessages: true,
          },
        },
      },
    });

    if (!user) {
      throw new NotFoundException("Kullanıcı bulunamadı");
    }

    const u = user as typeof user & {
      receivedRatings: Array<{ score: number }>;
      initiatedTrades: Array<{ createdAt: Date }>;
      receivedTrades: Array<{ createdAt: Date }>;
      buyerOrders: Array<{
        totalAmount: unknown;
        commissionAmount: unknown;
        seller: unknown;
      }>;
      sellerOrders: Array<{
        totalAmount: unknown;
        commissionAmount: unknown;
        buyer: unknown;
      }>;
      products: Array<{ images?: Array<{ cardKey: string }> }>;
      givenRatings: unknown[];
      _count: {
        products: number;
        buyerOrders: number;
        sellerOrders: number;
        givenRatings: number;
        receivedRatings: number;
        initiatedTrades: number;
        receivedTrades: number;
        sentMessages: number;
        receivedMessages: number;
      };
    };

    const avgRating =
      u.receivedRatings.length > 0
        ? u.receivedRatings.reduce((sum, r) => sum + r.score, 0) /
          u.receivedRatings.length
        : null;

    const allTrades = [
      ...u.initiatedTrades.map((t) => ({ ...t, role: "initiator" as const })),
      ...u.receivedTrades.map((t) => ({ ...t, role: "receiver" as const })),
    ]
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      )
      .slice(0, 10);

    const allOrders = [
      ...u.buyerOrders.map((o) => ({
        ...o,
        role: "buyer" as const,
        totalAmount: Number(o.totalAmount),
        commissionAmount: Number(o.commissionAmount),
        otherParty: o.seller,
      })),
      ...u.sellerOrders.map((o) => ({
        ...o,
        role: "seller" as const,
        totalAmount: Number(o.totalAmount),
        commissionAmount: Number(o.commissionAmount),
        otherParty: o.buyer,
      })),
    ]
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      )
      .slice(0, 10);

    // Üyeliği admin UI'ın beklediği şekle çevir (startDate/endDate alan adları +
    // status/autoRenew/cancelledAt). Aksi halde tarihler boş görünüyordu.
    const membershipForUi = (u as any).membership
      ? {
          tier: {
            name: (u as any).membership.tier?.name,
            type: (u as any).membership.tier?.type,
          },
          status: (u as any).membership.status,
          startDate: (u as any).membership.currentPeriodStart,
          endDate: (u as any).membership.currentPeriodEnd,
          autoRenew: (u as any).membership.autoRenew,
          cancelledAt: (u as any).membership.cancelledAt,
          scheduledTierType: (u as any).membership.scheduledTierType,
          scheduledBillingPeriod: (u as any).membership.scheduledBillingPeriod,
        }
      : undefined;

    return {
      ...u,
      membership: membershipForUi,
      lastLoginAt: u.lastLoginAt ?? null,
      lastActivityAt: u.lastActivityAt ?? null,
      averageRating: avgRating ? Math.round(avgRating * 10) / 10 : null,
      products: await Promise.all(
        u.products.map(async (p) => ({
          ...p,
          price: Number(p.price),
          imageUrl: this.resolveProductImageUrl(p.images?.[0]?.cardKey) || null,
        })),
      ),
      recentOrders: allOrders,
      recentTrades: allTrades.map((t) => ({
        ...t,
        cashAmount: (t as any).cashAmount
          ? Number((t as any).cashAmount)
          : null,
      })),
      givenRatings: u.givenRatings,
      receivedRatings: u.receivedRatings,
      stats: {
        productsCount: u._count.products,
        ordersCount: u._count.buyerOrders + u._count.sellerOrders,
        buyerOrdersCount: u._count.buyerOrders,
        sellerOrdersCount: u._count.sellerOrders,
        tradesCount: u._count.initiatedTrades + u._count.receivedTrades,
        initiatedTradesCount: u._count.initiatedTrades,
        receivedTradesCount: u._count.receivedTrades,
        messagesCount: u._count.sentMessages + u._count.receivedMessages,
        sentMessagesCount: u._count.sentMessages,
        receivedMessagesCount: u._count.receivedMessages,
        givenRatingsCount: u._count.givenRatings,
        receivedRatingsCount: u._count.receivedRatings,
      },
    };
  }

  // ==================== ADMIN: KULLANICI ÜYELİĞİ ====================

  /**
   * Admin: kullanıcının üyeliğini iptal eder (membership.service.cancelSubscription
   * mantığını yansıtır). status=cancelled, cancelledAt=now; tier'a dokunulmaz
   * (dönem sonuna kadar aktif, sonra cron free'ye düşürür). Free/zaten-iptal engel.
   */
  async adminCancelUserMembership(adminId: string, userId: string) {
    const membership = await this.prisma.userMembership.findUnique({
      where: { userId },
      include: { tier: true },
    });
    if (!membership) {
      throw new NotFoundException("Üyelik bulunamadı");
    }
    if (membership.tier.type === MembershipTierType.free) {
      throw new BadRequestException("Ücretsiz üyelik iptal edilemez");
    }
    if (membership.status === SubscriptionStatus.cancelled) {
      throw new BadRequestException("Üyelik zaten iptal edilmiş");
    }
    const updated = await this.prisma.userMembership.update({
      where: { userId },
      data: {
        status: SubscriptionStatus.cancelled,
        cancelledAt: new Date(),
      },
      include: { tier: true },
    });
    await this.audit.createAuditLog(
      adminId,
      "admin_membership_cancel",
      "UserMembership",
      membership.id,
      membership,
      updated,
    );
    return updated;
  }

  /**
   * Admin: kullanıcının üyeliğini herhangi bir kademeye anında geçirir (ödeme YOK,
   * admin override). Business hakkı yalnız KYC onaylı şirkete verilebilir.
   */
  async adminChangeUserMembership(
    adminId: string,
    userId: string,
    tierType: MembershipTierType,
    billingPeriod: "monthly" | "yearly" = "monthly",
  ) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        businessStatus: true,
        companyName: true,
        taxId: true,
      },
    });
    if (!user) {
      throw new NotFoundException("Kullanıcı bulunamadı");
    }
    const tier = await this.prisma.membershipTier.findUnique({
      where: { type: tierType },
    });
    if (!tier) {
      throw new NotFoundException(`Üyelik tipi bulunamadı: ${tierType}`);
    }
    if (!tier.isActive) {
      throw new BadRequestException("Bu üyelik kademesi aktif değil");
    }
    if (
      tierType === MembershipTierType.business &&
      (user.businessStatus !== "approved" ||
        !user.companyName?.trim() ||
        !user.taxId?.trim())
    ) {
      throw new BadRequestException(
        "Business üyelik yalnız KYC onaylı şirket hesabına atanabilir",
      );
    }

    const now = new Date();
    const periodEnd = new Date(now);
    if (tierType === MembershipTierType.free) {
      // Free: uzak tarih (lazy-create deseniyle aynı mantık).
      periodEnd.setFullYear(periodEnd.getFullYear() + 100);
    } else if (billingPeriod === "yearly") {
      periodEnd.setFullYear(periodEnd.getFullYear() + 1);
    } else {
      periodEnd.setMonth(periodEnd.getMonth() + 1);
    }

    const existing = await this.prisma.userMembership.findUnique({
      where: { userId },
      include: { tier: true },
    });

    const data = {
      tierId: tier.id,
      status: SubscriptionStatus.active,
      currentPeriodStart: now,
      currentPeriodEnd: periodEnd,
      cancelledAt: null,
      autoRenew: false,
      scheduledTierType: null,
      scheduledBillingPeriod: null,
    };

    const updated = existing
      ? await this.prisma.userMembership.update({
          where: { userId },
          data,
          include: { tier: true },
        })
      : await this.prisma.userMembership.create({
          data: { userId, ...data },
          include: { tier: true },
        });

    await this.audit.createAuditLog(
      adminId,
      "admin_membership_change",
      "UserMembership",
      updated.id,
      existing,
      updated,
    );
    return updated;
  }
}
