import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Optional,
} from "@nestjs/common";
import { PrismaService } from "../../../prisma";
import { StorageService } from "../../storage/storage.service";
import { AdminAuditService } from "../ops/admin-audit.service";
import { InjectQueue } from "@nestjs/bull";
import { Queue } from "bull";
import { QUEUE_NAMES } from "../../../workers/constants";
import { enqueueSellerListingReindex } from "../../membership/helpers/seller-listing-reindex";
import { fulltextUserSearch } from "../../../common/helpers/fulltext-search";
import { AdminUserQueryDto } from "../dto";
import { Prisma, MembershipTierType, SubscriptionStatus } from "@prisma/client";
import {
  ADMIN_LIST_DEFAULT_LIMIT,
  ADMIN_LIST_DEFAULT_PAGE,
  ADMIN_LIST_MAX_LIMIT,
  dateRangeWhere,
  paginate,
  resolveOrderBy,
} from "../../../common/list";
import { catalogProductWhere } from "../../product/helpers/catalog-product-where";
import { PUBLIC_IDENTITY_SELECT } from "../../../common/helpers/public-identity";
import { i18nMessage } from "../../i18n";
import {
  deriveAccountStatus,
  type AccountStatus,
  type AccountStatusInput,
} from "@tarodan/types";

/**
 * Türetilmiş hesap durumu filtresi → Prisma where. Filtre verilmezse silinmiş
 * (anonimleştirilmiş) hesaplar listelenmez; onları yalnız "deleted" getirir.
 * Eşleme deriveAccountStatus önceliğinin tersidir; ikisi birlikte test edilir.
 */
export function accountStatusWhere(
  status: AccountStatus | undefined,
): Prisma.UserWhereInput {
  switch (status) {
    case "deleted":
      return { deletedAt: { not: null } };
    case "banned":
      return { deletedAt: null, isBanned: true };
    case "pending_activation":
      return { deletedAt: null, isBanned: false, isEmailVerified: false };
    case "active":
      return { deletedAt: null, isBanned: false, isEmailVerified: true };
    default:
      return { deletedAt: null };
  }
}

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
    // Admin katman değişikliği takas yetkisini değiştirir; arama dokümanı
    // (sellerCanTrade) ancak reindex'le tazelenir.
    @Optional()
    @InjectQueue(QUEUE_NAMES.SEARCH)
    private readonly searchQueue?: Queue,
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

    // Personel (AdminUser satırı olan) hesaplar müşteri listesinde yer almaz;
    // onlar Personel ekranında yönetilir. Sayaçlar da aynı sorgudan geçer.
    const where: Prisma.UserWhereInput = { adminUser: null };

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

    // `isBanned` bu filtrenin eski hâli; `accountStatus=banned` onu kapsıyor.
    // İkisi birden gelirse accountStatus kazanır — ama bunu sessiz bir üzerine
    // yazmaya bırakmıyoruz: eski parametre yalnız yenisi YOKKEN uygulanır,
    // yoksa `isBanned=true&accountStatus=active` engelli olmayanları döndürür.
    if (query.accountStatus) {
      Object.assign(where, accountStatusWhere(query.accountStatus));
    } else {
      if (query.isBanned === true) where.isBanned = true;
      Object.assign(where, accountStatusWhere(undefined));
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
      avatarUrl: true,
      phone: true,
      isSeller: true,
      sellerType: true,
      isVerified: true,
      isEmailVerified: true,
      isBanned: true,
      deletedAt: true,
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
          products: { where: catalogProductWhere() },
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
        data: await this.decorateUserRows(rows),
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
      data: await this.decorateUserRows(result.data),
    };
  }

  /**
   * Liste satırının türetilmiş alanları — her iki dönüş yolu (ordersCount
   * sıralaması ve paginate) aynı süslemeden geçer: iptal sayısı + hesap durumu.
   */
  private async decorateUserRows<T extends { id: string } & AccountStatusInput>(
    rows: T[],
  ) {
    const withCounts = await this.attachCancelledCounts(rows);
    return withCounts.map((row) => ({
      ...row,
      accountStatus: deriveAccountStatus(row),
    }));
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
      // `include:` idi ve dönüş `...u` ile yayılıyordu: User'ın HER sütunu
      // (passwordHash, fcmToken, notificationSettings, bannedBy…) ve ilişkilerin
      // her alanı yanıta giriyordu. Açık select, ekranın gerçekten okuduğu
      // alanlarla sınırlar (CLAUDE.md §5 "yalnız döndürdüğünü sorgula").
      // getUsers'ın select'iyle birleştirilmedi: liste satırı sayaç/üyelik
      // alt-seçimlerinde farklı, ortak sabit ikisini de bozardı.
      select: {
        id: true,
        email: true,
        phone: true,
        displayName: true,
        avatarUrl: true,
        bio: true,
        isVerified: true,
        isEmailVerified: true,
        isPhoneVerified: true,
        isSeller: true,
        sellerType: true,
        taxId: true,
        companyName: true,
        // Personel hesabı detayda yalnız uyarı ve Personel ekranına bağlantı
        // gösterir; kullanıcı aksiyonları kapalıdır.
        adminUser: { select: { role: true, isActive: true } },
        createdAt: true,
        bannedAt: true,
        bannedReason: true,
        isBanned: true,
        deletedAt: true,
        lastLoginAt: true,
        lastActivityAt: true,
        addresses: {
          select: {
            id: true,
            title: true,
            address: true,
            city: true,
            district: true,
            zipCode: true,
            isDefault: true,
          },
        },
        products: {
          where: catalogProductWhere(),
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
          select: {
            id: true,
            orderNumber: true,
            totalAmount: true,
            commissionAmount: true,
            status: true,
            createdAt: true,
            seller: { select: { id: true, displayName: true } },
            product: { select: { id: true, title: true } },
          },
        },
        sellerOrders: {
          take: 10,
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            orderNumber: true,
            totalAmount: true,
            commissionAmount: true,
            status: true,
            createdAt: true,
            buyer: { select: { id: true, displayName: true } },
            product: { select: { id: true, title: true } },
          },
        },
        initiatedTrades: {
          take: 10,
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            tradeNumber: true,
            status: true,
            createdAt: true,
            cashAmount: true,
            receiver: { select: { id: true, displayName: true } },
            items: {
              select: {
                side: true,
                product: { select: { id: true, title: true } },
              },
            },
          },
        },
        receivedTrades: {
          take: 10,
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            tradeNumber: true,
            status: true,
            createdAt: true,
            cashAmount: true,
            initiator: { select: { id: true, displayName: true } },
            items: {
              select: {
                side: true,
                product: { select: { id: true, title: true } },
              },
            },
          },
        },
        givenRatings: {
          take: 5,
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            score: true,
            comment: true,
            createdAt: true,
            receiver: { select: { id: true, displayName: true } },
          },
        },
        receivedRatings: {
          take: 5,
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            score: true,
            comment: true,
            createdAt: true,
            giver: { select: { id: true, displayName: true } },
          },
        },
        membership: {
          select: {
            status: true,
            currentPeriodStart: true,
            currentPeriodEnd: true,
            autoRenew: true,
            cancelledAt: true,
            scheduledTierType: true,
            scheduledBillingPeriod: true,
            tier: { select: { name: true, type: true } },
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
        // Apple App Review: admin engellemeleri görebilsin (iki yön).
        blocksGiven: {
          take: 20,
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            reason: true,
            createdAt: true,
            blocked: { select: PUBLIC_IDENTITY_SELECT },
          },
        },
        blocksReceived: {
          take: 20,
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            reason: true,
            createdAt: true,
            blocker: { select: PUBLIC_IDENTITY_SELECT },
          },
        },
        _count: {
          select: {
            products: { where: catalogProductWhere() },
            buyerOrders: true,
            sellerOrders: true,
            givenRatings: true,
            receivedRatings: true,
            initiatedTrades: true,
            receivedTrades: true,
            sentMessages: true,
            receivedMessages: true,
            blocksGiven: true,
            blocksReceived: true,
          },
        },
      },
    });

    if (!user) {
      throw new NotFoundException(i18nMessage("server.auth.userNotFound"));
    }

    const avgRating =
      user.receivedRatings.length > 0
        ? user.receivedRatings.reduce((sum, r) => sum + r.score, 0) /
          user.receivedRatings.length
        : null;

    // Takas kalemleri tek `items` dizisinde `side` ile geliyor; ekran
    // "a ürün ↔ b ürün" özetini initiatorItems/receiverItems'tan okuyor.
    // Ham `items` döndürülüyordu, dolayısıyla Takaslar sekmesi
    // `initiatorItems.length` üzerinde TypeError ile patlıyordu.
    const splitTradeItems = <
      T extends { items: Array<{ side: string; product: unknown }> },
    >(
      trade: T,
    ) => {
      const { items, ...rest } = trade;
      return {
        ...rest,
        initiatorItems: items.filter((i) => i.side === "initiator"),
        receiverItems: items.filter((i) => i.side !== "initiator"),
      };
    };

    const allTrades = [
      ...user.initiatedTrades.map((t) => ({
        ...splitTradeItems(t),
        role: "initiator" as const,
      })),
      ...user.receivedTrades.map((t) => ({
        ...splitTradeItems(t),
        role: "receiver" as const,
      })),
    ]
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      )
      .slice(0, 10)
      .map((t) => ({
        ...t,
        cashAmount: t.cashAmount ? Number(t.cashAmount) : null,
      }));

    const allOrders = [
      ...user.buyerOrders.map((o) => ({
        ...o,
        role: "buyer" as const,
        totalAmount: Number(o.totalAmount),
        commissionAmount: Number(o.commissionAmount),
        otherParty: o.seller,
      })),
      ...user.sellerOrders.map((o) => ({
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
    const membershipForUi = user.membership
      ? {
          tier: {
            name: user.membership.tier?.name,
            type: user.membership.tier?.type,
          },
          status: user.membership.status,
          startDate: user.membership.currentPeriodStart,
          endDate: user.membership.currentPeriodEnd,
          autoRenew: user.membership.autoRenew,
          cancelledAt: user.membership.cancelledAt,
          scheduledTierType: user.membership.scheduledTierType,
          scheduledBillingPeriod: user.membership.scheduledBillingPeriod,
        }
      : undefined;

    return {
      id: user.id,
      email: user.email,
      phone: user.phone,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl,
      bio: user.bio,
      isVerified: user.isVerified,
      isEmailVerified: user.isEmailVerified,
      isPhoneVerified: user.isPhoneVerified,
      isSeller: user.isSeller,
      sellerType: user.sellerType,
      taxId: user.taxId,
      companyName: user.companyName,
      createdAt: user.createdAt,
      isBanned: user.isBanned,
      bannedAt: user.bannedAt,
      bannedReason: user.bannedReason,
      deletedAt: user.deletedAt,
      accountStatus: deriveAccountStatus(user),
      staff: user.adminUser
        ? { role: user.adminUser.role, isActive: user.adminUser.isActive }
        : null,
      bankAccount: user.bankAccount,
      membership: membershipForUi,
      lastLoginAt: user.lastLoginAt ?? null,
      lastActivityAt: user.lastActivityAt ?? null,
      averageRating: avgRating ? Math.round(avgRating * 10) / 10 : null,
      // Address sütunları `address`/`zipCode`; ekran `fullAddress`/`postalCode`
      // okuyor. Eşleme yoktu, o iki satır boş basılıyordu.
      addresses: user.addresses.map((a) => ({
        id: a.id,
        title: a.title,
        fullAddress: a.address,
        city: a.city,
        district: a.district,
        postalCode: a.zipCode,
        isDefault: a.isDefault,
      })),
      products: user.products.map((p) => ({
        id: p.id,
        title: p.title,
        status: p.status,
        createdAt: p.createdAt,
        price: Number(p.price),
        imageUrl: this.resolveProductImageUrl(p.images?.[0]?.cardKey) || null,
      })),
      recentOrders: allOrders,
      recentTrades: allTrades,
      givenRatings: user.givenRatings,
      receivedRatings: user.receivedRatings,
      stats: {
        productsCount: user._count.products,
        ordersCount: user._count.buyerOrders + user._count.sellerOrders,
        buyerOrdersCount: user._count.buyerOrders,
        sellerOrdersCount: user._count.sellerOrders,
        tradesCount: user._count.initiatedTrades + user._count.receivedTrades,
        initiatedTradesCount: user._count.initiatedTrades,
        receivedTradesCount: user._count.receivedTrades,
        messagesCount: user._count.sentMessages + user._count.receivedMessages,
        sentMessagesCount: user._count.sentMessages,
        receivedMessagesCount: user._count.receivedMessages,
        givenRatingsCount: user._count.givenRatings,
        receivedRatingsCount: user._count.receivedRatings,
        blocksGivenCount: user._count.blocksGiven,
        blocksReceivedCount: user._count.blocksReceived,
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
      throw new NotFoundException(i18nMessage("server.membership.notFound"));
    }
    if (membership.tier.type === MembershipTierType.free) {
      throw new BadRequestException(
        i18nMessage("server.membership.freeTierCannotCancel"),
      );
    }
    if (membership.status === SubscriptionStatus.cancelled) {
      throw new BadRequestException(
        i18nMessage("server.membership.alreadyCancelled"),
      );
    }
    const updated = await this.prisma.userMembership.update({
      where: { userId },
      data: {
        status: SubscriptionStatus.cancelled,
        cancelledAt: new Date(),
        // Kullanıcı tarafındaki iptalle parite: iptal edilen üyelik dönem
        // sonunda ÇEKİLMEMELİ. Açık kalsaydı runAutoRenewals kartı çekip
        // admin iptalini sessizce geri alırdı.
        autoRenew: false,
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
    await enqueueSellerListingReindex(this.prisma, this.searchQueue, userId);
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
      throw new NotFoundException(i18nMessage("server.auth.userNotFound"));
    }
    const tier = await this.prisma.membershipTier.findUnique({
      where: { type: tierType },
    });
    if (!tier) {
      throw new NotFoundException(
        i18nMessage("server.admin.membership.tierTypeNotFound", {
          type: tierType,
        }),
      );
    }
    if (!tier.isActive) {
      throw new BadRequestException(
        i18nMessage("server.admin.membership.tierInactive"),
      );
    }
    const isApprovedCorporate =
      user.businessStatus === "approved" &&
      !!user.companyName?.trim() &&
      !!user.taxId?.trim();
    if (tierType === MembershipTierType.business && !isApprovedCorporate) {
      throw new BadRequestException(
        i18nMessage("server.admin.membership.businessRequiresKyc"),
      );
    }
    if (tierType !== MembershipTierType.business && isApprovedCorporate) {
      throw new BadRequestException(
        i18nMessage("server.admin.membership.kycRequiresBusiness"),
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
    // Best-effort: üyelik değişince tüm ilanların satış/takas yetkisi tazelensin.
    await enqueueSellerListingReindex(this.prisma, this.searchQueue, userId);
    return updated;
  }
}
