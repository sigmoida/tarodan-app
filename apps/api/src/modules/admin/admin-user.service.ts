import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Optional,
} from '@nestjs/common';
import { PrismaService } from '../../prisma';
import { StorageService } from '../storage/storage.service';
import { AdminAuditService } from './admin-audit.service';
import { fulltextUserSearch } from '../../common/helpers/fulltext-search';
import { AdminUserQueryDto } from './dto';
import { Prisma, MembershipTierType, SubscriptionStatus } from '@prisma/client';

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
  private resolveProductImageUrl(imageKeyOrUrl: string | null | undefined): string | null {
    if (!imageKeyOrUrl) return null;
    // Strip expired presigned S3 query params to get the clean public URL
    if ((imageKeyOrUrl.startsWith('http://') || imageKeyOrUrl.startsWith('https://')) && imageKeyOrUrl.includes('X-Amz-Signature')) {
      try {
        const parsed = new URL(imageKeyOrUrl);
        parsed.search = '';
        return parsed.toString();
      } catch {
        // fall through
      }
    }
    if (imageKeyOrUrl.startsWith('http://') || imageKeyOrUrl.startsWith('https://') || imageKeyOrUrl.startsWith('/')) return imageKeyOrUrl;
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
    const { search, isSeller, isVerified, page = 1, limit = 20 } = query;

    const where: Prisma.UserWhereInput = {};

    if (search) {
      const userIds = await fulltextUserSearch(this.prisma, search);
      if (userIds.length === 0) {
        return { data: [], total: 0, page, limit, totalPages: 0 };
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

    const [total, users] = await Promise.all([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
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
            },
          },
        },
        orderBy: [
          { lastLoginAt: { sort: 'desc', nulls: 'last' } },
          { createdAt: 'desc' },
        ],
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return {
      data: users,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
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
          orderBy: { createdAt: 'desc' },
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
          orderBy: { createdAt: 'desc' },
          include: {
            seller: { select: { id: true, displayName: true } },
            product: { select: { id: true, title: true } },
          },
        },
        sellerOrders: {
          take: 10,
          orderBy: { createdAt: 'desc' },
          include: {
            buyer: { select: { id: true, displayName: true } },
            product: { select: { id: true, title: true } },
          },
        },
        initiatedTrades: {
          take: 10,
          orderBy: { createdAt: 'desc' },
          include: {
            receiver: { select: { id: true, displayName: true } },
            items: { include: { product: { select: { id: true, title: true } } } },
          },
        },
        receivedTrades: {
          take: 10,
          orderBy: { createdAt: 'desc' },
          include: {
            initiator: { select: { id: true, displayName: true } },
            items: { include: { product: { select: { id: true, title: true } } } },
          },
        },
        givenRatings: {
          take: 5,
          orderBy: { createdAt: 'desc' },
          include: {
            receiver: { select: { id: true, displayName: true } },
          },
        },
        receivedRatings: {
          take: 5,
          orderBy: { createdAt: 'desc' },
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
      throw new NotFoundException('Kullanıcı bulunamadı');
    }

    const u = user as typeof user & {
      receivedRatings: Array<{ score: number }>;
      initiatedTrades: Array<{ createdAt: Date }>;
      receivedTrades: Array<{ createdAt: Date }>;
      buyerOrders: Array<{ totalAmount: unknown; commissionAmount: unknown; seller: unknown }>;
      sellerOrders: Array<{ totalAmount: unknown; commissionAmount: unknown; buyer: unknown }>;
      products: Array<{ images?: Array<{ cardKey: string }> }>;
      givenRatings: unknown[];
      _count: { products: number; buyerOrders: number; sellerOrders: number; givenRatings: number; receivedRatings: number; initiatedTrades: number; receivedTrades: number; sentMessages: number; receivedMessages: number };
    };

    const avgRating = u.receivedRatings.length > 0
      ? u.receivedRatings.reduce((sum, r) => sum + r.score, 0) / u.receivedRatings.length
      : null;

    const allTrades = [
      ...u.initiatedTrades.map((t) => ({ ...t, role: 'initiator' as const })),
      ...u.receivedTrades.map((t) => ({ ...t, role: 'receiver' as const })),
    ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 10);

    const allOrders = [
      ...u.buyerOrders.map((o) => ({
        ...o,
        role: 'buyer' as const,
        totalAmount: Number(o.totalAmount),
        commissionAmount: Number(o.commissionAmount),
        otherParty: o.seller,
      })),
      ...u.sellerOrders.map((o) => ({
        ...o,
        role: 'seller' as const,
        totalAmount: Number(o.totalAmount),
        commissionAmount: Number(o.commissionAmount),
        otherParty: o.buyer,
      })),
    ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 10);

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
        }
      : undefined;

    return {
      ...u,
      membership: membershipForUi,
      lastLoginAt: u.lastLoginAt ?? null,
      lastActivityAt: u.lastActivityAt ?? null,
      averageRating: avgRating ? Math.round(avgRating * 10) / 10 : null,
      products: await Promise.all(u.products.map(async (p) => ({
        ...p,
        price: Number(p.price),
        imageUrl: this.resolveProductImageUrl(p.images?.[0]?.cardKey) || null,
      }))),
      recentOrders: allOrders,
      recentTrades: allTrades.map((t) => ({
        ...t,
        cashAmount: (t as any).cashAmount ? Number((t as any).cashAmount) : null,
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
      throw new NotFoundException('Üyelik bulunamadı');
    }
    if (membership.tier.type === MembershipTierType.free) {
      throw new BadRequestException('Ücretsiz üyelik iptal edilemez');
    }
    if (membership.status === SubscriptionStatus.cancelled) {
      throw new BadRequestException('Üyelik zaten iptal edilmiş');
    }
    const updated = await this.prisma.userMembership.update({
      where: { userId },
      data: {
        status: SubscriptionStatus.cancelled,
        cancelledAt: new Date(),
      },
      include: { tier: true },
    });
    await this.audit.createAuditLog(adminId, 'admin_membership_cancel', 'UserMembership', membership.id, membership, updated);
    return updated;
  }

  /**
   * Admin: kullanıcının üyeliğini herhangi bir kademeye anında geçirir (ödeme YOK,
   * admin override). subscribe'ın free-aktivasyon dalını yansıtır.
   * NOT: business için şirket-hesabı (companyName/taxId) kuralı BİLİNÇLİ uygulanmaz —
   * admin override mutlaktır.
   */
  async adminChangeUserMembership(
    adminId: string,
    userId: string,
    tierType: MembershipTierType,
    billingPeriod: 'monthly' | 'yearly' = 'monthly',
  ) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
    if (!user) {
      throw new NotFoundException('Kullanıcı bulunamadı');
    }
    const tier = await this.prisma.membershipTier.findUnique({ where: { type: tierType } });
    if (!tier) {
      throw new NotFoundException(`Üyelik tipi bulunamadı: ${tierType}`);
    }
    if (!tier.isActive) {
      throw new BadRequestException('Bu üyelik kademesi aktif değil');
    }

    const now = new Date();
    const periodEnd = new Date(now);
    if (tierType === MembershipTierType.free) {
      // Free: uzak tarih (lazy-create deseniyle aynı mantık).
      periodEnd.setFullYear(periodEnd.getFullYear() + 100);
    } else if (billingPeriod === 'yearly') {
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
    };

    const updated = existing
      ? await this.prisma.userMembership.update({ where: { userId }, data, include: { tier: true } })
      : await this.prisma.userMembership.create({ data: { userId, ...data }, include: { tier: true } });

    await this.audit.createAuditLog(adminId, 'admin_membership_change', 'UserMembership', updated.id, existing, updated);
    return updated;
  }
}
