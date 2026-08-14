import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from "@nestjs/common";
import {
  AdPackageAudienceMode,
  BoostStatus,
  MembershipTierType,
  Prisma,
} from "@prisma/client";
import { PrismaService } from "../../prisma";
import { isPremiumEntitled } from "../membership/membership.util";
import { computeRelevanceScore } from "../product/helpers/relevance-score";
import {
  CreateAdPackageDto,
  UpdateAdPackageDto,
  AdPackageTierDto,
} from "./dto/ad-package.dto";
import { paginate } from "../../common/list";
import { i18nMessage } from "../i18n";

/**
 * Admin management of the dynamic ad/boost packages (Ekonomik / Vitrin / …) and
 * their price tiers, plus read-only tracking of every boost purchase (who bought
 * which package for which product, when, for how much).
 */
@Injectable()
export class AdminAdPackageService {
  constructor(private readonly prisma: PrismaService) {}

  private normalizeAudienceTargets(
    audienceMode: AdPackageAudienceMode,
    targetTierTypes: MembershipTierType[],
    targetUserIds: string[],
  ) {
    const tiers = Array.from(new Set(targetTierTypes));
    const users = Array.from(new Set(targetUserIds));

    if (
      audienceMode === AdPackageAudienceMode.membership_tiers &&
      tiers.length === 0
    ) {
      throw new BadRequestException(
        i18nMessage("server.admin.adPackage.tierRequired"),
      );
    }
    if (
      audienceMode === AdPackageAudienceMode.specific_users &&
      users.length === 0
    ) {
      throw new BadRequestException(
        i18nMessage("server.admin.adPackage.userRequired"),
      );
    }
    if (
      audienceMode === AdPackageAudienceMode.tiers_or_users &&
      tiers.length === 0 &&
      users.length === 0
    ) {
      throw new BadRequestException(
        i18nMessage("server.admin.adPackage.targetRequired"),
      );
    }

    return {
      targetTierTypes:
        audienceMode === AdPackageAudienceMode.membership_tiers ||
        audienceMode === AdPackageAudienceMode.tiers_or_users
          ? tiers
          : [],
      targetUserIds:
        audienceMode === AdPackageAudienceMode.specific_users ||
        audienceMode === AdPackageAudienceMode.tiers_or_users
          ? users
          : [],
    };
  }

  private tierData(t: AdPackageTierDto) {
    return {
      durationDays: t.durationDays,
      minAmount: new Prisma.Decimal(t.minAmount),
      maxAmount: t.maxAmount == null ? null : new Prisma.Decimal(t.maxAmount),
      price: new Prisma.Decimal(t.price),
      campaignPrice:
        t.campaignPrice == null ? null : new Prisma.Decimal(t.campaignPrice),
      campaignStartsAt: t.campaignStartsAt
        ? new Date(t.campaignStartsAt)
        : null,
      campaignEndsAt: t.campaignEndsAt ? new Date(t.campaignEndsAt) : null,
      isActive: t.isActive ?? true,
    };
  }

  private serialize(pkg: any) {
    return {
      id: pkg.id,
      name: pkg.name,
      slug: pkg.slug,
      showcaseOnHome: pkg.showcaseOnHome,
      isActive: pkg.isActive,
      sortOrder: pkg.sortOrder,
      audienceMode: pkg.audienceMode,
      targetTierTypes: (pkg.targetTiers ?? []).map((t: any) => t.tierType),
      targetUsers: (pkg.targetUsers ?? []).map((target: any) => ({
        id: target.user.id,
        adminCode: target.user.adminCode,
        username: target.user.username,
        displayName: target.user.displayName,
        email: target.user.email,
      })),
      createdAt: pkg.createdAt,
      tiers: (pkg.tiers ?? []).map((t: any) => ({
        id: t.id,
        durationDays: t.durationDays,
        minAmount: Number(t.minAmount),
        maxAmount: t.maxAmount == null ? null : Number(t.maxAmount),
        price: Number(t.price),
        campaignPrice: t.campaignPrice == null ? null : Number(t.campaignPrice),
        campaignStartsAt: t.campaignStartsAt,
        campaignEndsAt: t.campaignEndsAt,
        isActive: t.isActive,
      })),
    };
  }

  private purchaseMetrics(boost: any) {
    const current = {
      views: boost.finalViewCount ?? boost.product?.viewCount ?? 0,
      likes: boost.finalLikeCount ?? boost.product?.likeCount ?? 0,
      clicks: boost.finalClickCount ?? boost.product?.clickCount ?? 0,
    };
    const before =
      boost.baselineViewCount == null
        ? null
        : {
            views: boost.baselineViewCount,
            likes: boost.baselineLikeCount ?? 0,
            clicks: boost.baselineClickCount ?? 0,
          };
    const gain = before
      ? {
          views: current.views - before.views,
          likes: current.likes - before.likes,
          clicks: current.clicks - before.clicks,
        }
      : null;
    const performanceScore = gain
      ? Math.max(0, gain.views) +
        Math.max(0, gain.likes) * 5 +
        Math.max(0, gain.clicks) * 3
      : null;
    return { before, current, gain, performanceScore };
  }

  private serializePurchase(boost: any, bestScore?: number) {
    const now = Date.now();
    const metrics = this.purchaseMetrics(boost);
    const remainingSeconds =
      boost.status === BoostStatus.active && boost.endsAt
        ? Math.max(
            0,
            Math.ceil((new Date(boost.endsAt).getTime() - now) / 1000),
          )
        : boost.status === BoostStatus.paused
          ? (boost.pausedRemainingSeconds ?? 0)
          : 0;
    return {
      id: boost.id,
      buyer: boost.user
        ? {
            id: boost.user.id,
            adminCode: boost.user.adminCode,
            username: boost.user.username,
            name: boost.user.displayName,
            email: boost.user.email,
            avatarUrl: boost.user.avatarUrl,
          }
        : null,
      product: boost.product
        ? {
            id: boost.product.id,
            title: boost.product.title,
            status: boost.product.status,
          }
        : null,
      packageName: boost.packageName ?? boost.package?.name ?? null,
      showcaseOnHome: boost.showcaseOnHome,
      durationDays: boost.durationDays,
      extendedDays: boost.extendedDays,
      price: Number(boost.price),
      status: boost.status,
      startsAt: boost.startsAt,
      endsAt: boost.endsAt,
      pausedAt: boost.pausedAt,
      purchasedAt: boost.purchasedAt,
      remainingSeconds,
      metrics,
      isBestForBuyer:
        bestScore != null &&
        metrics.performanceScore != null &&
        metrics.performanceScore === bestScore,
      createdAt: boost.createdAt,
      updatedAt: boost.updatedAt,
    };
  }

  async listPackages() {
    const packages = await this.prisma.adPackage.findMany({
      orderBy: { sortOrder: "asc" },
      include: {
        tiers: { orderBy: [{ durationDays: "asc" }, { minAmount: "asc" }] },
        targetTiers: true,
        targetUsers: {
          include: {
            user: {
              select: {
                id: true,
                adminCode: true,
                username: true,
                displayName: true,
                email: true,
              },
            },
          },
        },
      },
    });
    return { data: packages.map((p) => this.serialize(p)) };
  }

  async createPackage(dto: CreateAdPackageDto) {
    const existing = await this.prisma.adPackage.findUnique({
      where: { slug: dto.slug },
    });
    if (existing) {
      throw new BadRequestException("Bu slug ile bir paket zaten var");
    }
    const audienceMode = dto.audienceMode ?? AdPackageAudienceMode.everyone;
    const targets = this.normalizeAudienceTargets(
      audienceMode,
      dto.targetTierTypes ?? [],
      dto.targetUserIds ?? [],
    );
    const pkg = await this.prisma.adPackage.create({
      data: {
        name: dto.name,
        slug: dto.slug,
        showcaseOnHome: dto.showcaseOnHome ?? false,
        isActive: dto.isActive ?? true,
        sortOrder: dto.sortOrder ?? 0,
        audienceMode,
        targetTiers: targets.targetTierTypes.length
          ? {
              create: targets.targetTierTypes.map((tierType) => ({ tierType })),
            }
          : undefined,
        targetUsers: targets.targetUserIds.length
          ? {
              create: targets.targetUserIds.map((userId) => ({ userId })),
            }
          : undefined,
        tiers: dto.tiers?.length
          ? { create: dto.tiers.map((t) => this.tierData(t)) }
          : undefined,
      },
      include: {
        tiers: true,
        targetTiers: true,
        targetUsers: { include: { user: true } },
      },
    });
    return this.serialize(pkg);
  }

  async updatePackage(id: string, dto: UpdateAdPackageDto) {
    const pkg = await this.prisma.adPackage.findUnique({
      where: { id },
      include: { targetTiers: true, targetUsers: true },
    });
    if (!pkg)
      throw new NotFoundException(
        i18nMessage("server.admin.adPackage.notFound"),
      );

    if (dto.slug && dto.slug !== pkg.slug) {
      const clash = await this.prisma.adPackage.findUnique({
        where: { slug: dto.slug },
      });
      if (clash)
        throw new BadRequestException("Bu slug ile bir paket zaten var");
    }
    const audienceMode = dto.audienceMode ?? pkg.audienceMode;
    const targets = this.normalizeAudienceTargets(
      audienceMode,
      dto.targetTierTypes ?? pkg.targetTiers.map((target) => target.tierType),
      dto.targetUserIds ?? pkg.targetUsers.map((target) => target.userId),
    );

    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.adPackage.update({
        where: { id },
        data: {
          name: dto.name ?? undefined,
          slug: dto.slug ?? undefined,
          showcaseOnHome: dto.showcaseOnHome ?? undefined,
          isActive: dto.isActive ?? undefined,
          sortOrder: dto.sortOrder ?? undefined,
          audienceMode,
        },
      });
      // "satır ekle/çıkar": verilirse kademe satırları toptan değiştirilir.
      if (dto.tiers) {
        await tx.adPackageTier.deleteMany({ where: { packageId: id } });
        if (dto.tiers.length) {
          await tx.adPackageTier.createMany({
            data: dto.tiers.map((t) => ({
              packageId: id,
              ...this.tierData(t),
            })),
          });
        }
      }
      await tx.adPackageMembershipTier.deleteMany({
        where: { packageId: id },
      });
      if (targets.targetTierTypes.length) {
        await tx.adPackageMembershipTier.createMany({
          data: targets.targetTierTypes.map((tierType) => ({
            packageId: id,
            tierType,
          })),
        });
      }
      await tx.adPackageUserTarget.deleteMany({ where: { packageId: id } });
      if (targets.targetUserIds.length) {
        await tx.adPackageUserTarget.createMany({
          data: targets.targetUserIds.map((userId) => ({
            packageId: id,
            userId,
          })),
        });
      }
      return tx.adPackage.findUnique({
        where: { id },
        include: {
          tiers: { orderBy: [{ durationDays: "asc" }, { minAmount: "asc" }] },
          targetTiers: true,
          targetUsers: { include: { user: true } },
        },
      });
    });
    return this.serialize(updated);
  }

  async deletePackage(id: string) {
    const pkg = await this.prisma.adPackage.findUnique({ where: { id } });
    if (!pkg)
      throw new NotFoundException(
        i18nMessage("server.admin.adPackage.notFound"),
      );
    // Cascade deletes tiers; ProductBoost.packageId → SetNull (geçmiş korunur).
    await this.prisma.adPackage.delete({ where: { id } });
    return { success: true };
  }

  /** Boost satın alma takibi: kim, hangi ürün, hangi paket, ne zaman, ne kadar. */
  async listPurchases(query: {
    page?: number;
    limit?: number;
    packageId?: string;
    status?: string;
    search?: string;
  }) {
    const { page = 1, limit = 20, packageId, status, search } = query;
    const where: Prisma.ProductBoostWhereInput = {};
    if (packageId) where.packageId = packageId;
    if (status) where.status = status as any;
    const term = search?.trim();
    if (term) {
      where.OR = [
        { product: { title: { contains: term, mode: "insensitive" } } },
        { user: { displayName: { contains: term, mode: "insensitive" } } },
        { user: { email: { contains: term, mode: "insensitive" } } },
        { packageName: { contains: term, mode: "insensitive" } },
      ];
    }

    const result = await paginate(
      this.prisma.productBoost,
      {
        where,
        orderBy: { createdAt: "desc" },
        include: {
          user: {
            select: {
              id: true,
              adminCode: true,
              username: true,
              displayName: true,
              email: true,
              avatarUrl: true,
            },
          },
          package: { select: { id: true, name: true } },
          product: {
            select: {
              id: true,
              title: true,
              status: true,
              viewCount: true,
              likeCount: true,
              clickCount: true,
            },
          },
        },
      },
      { page, limit },
    );

    return {
      ...result,
      data: result.data.map((boost) => this.serializePurchase(boost)),
    };
  }

  async getPurchase(id: string) {
    const boost = await this.prisma.productBoost.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            id: true,
            adminCode: true,
            username: true,
            displayName: true,
            email: true,
            avatarUrl: true,
          },
        },
        package: { select: { id: true, name: true } },
        product: {
          select: {
            id: true,
            title: true,
            status: true,
            viewCount: true,
            likeCount: true,
            clickCount: true,
          },
        },
      },
    });
    if (!boost)
      throw new NotFoundException(
        i18nMessage("server.admin.adPackage.purchaseNotFound"),
      );

    const buyerBoosts = await this.prisma.productBoost.findMany({
      where: { userId: boost.userId, baselineViewCount: { not: null } },
      include: {
        product: {
          select: {
            viewCount: true,
            likeCount: true,
            clickCount: true,
          },
        },
      },
    });
    const bestScore = buyerBoosts.reduce(
      (best, item) =>
        Math.max(best, this.purchaseMetrics(item).performanceScore ?? -1),
      -1,
    );
    return this.serializePurchase(boost, bestScore);
  }

  async pausePurchase(id: string) {
    const boost = await this.prisma.productBoost.findUnique({ where: { id } });
    if (
      !boost ||
      boost.status !== BoostStatus.active ||
      !boost.endsAt ||
      boost.endsAt <= new Date()
    ) {
      throw new BadRequestException(
        i18nMessage("server.admin.adPackage.pauseActiveOnly"),
      );
    }
    const now = new Date();
    await this.prisma.productBoost.update({
      where: { id },
      data: {
        status: BoostStatus.paused,
        pausedAt: now,
        pausedRemainingSeconds: Math.max(
          1,
          Math.ceil((boost.endsAt.getTime() - now.getTime()) / 1000),
        ),
      },
    });
    await this.refreshProductPromotion(boost.productId);
    return this.getPurchase(id);
  }

  async resumePurchase(id: string) {
    const boost = await this.prisma.productBoost.findUnique({ where: { id } });
    if (!boost || boost.status !== BoostStatus.paused) {
      throw new BadRequestException(
        i18nMessage("server.admin.adPackage.resumePausedOnly"),
      );
    }
    const now = new Date();
    const lastActive = await this.prisma.productBoost.findFirst({
      where: {
        productId: boost.productId,
        id: { not: id },
        status: BoostStatus.active,
        endsAt: { gt: now },
      },
      orderBy: { endsAt: "desc" },
      select: { endsAt: true },
    });
    const base =
      lastActive?.endsAt && lastActive.endsAt > now ? lastActive.endsAt : now;
    const endsAt = new Date(
      base.getTime() + (boost.pausedRemainingSeconds ?? 0) * 1000,
    );
    await this.prisma.productBoost.update({
      where: { id },
      data: {
        status: BoostStatus.active,
        endsAt,
        pausedAt: null,
        pausedRemainingSeconds: null,
      },
    });
    await this.refreshProductPromotion(boost.productId);
    return this.getPurchase(id);
  }

  async extendPurchase(id: string, days: number) {
    const boost = await this.prisma.productBoost.findUnique({ where: { id } });
    if (
      !boost ||
      (boost.status !== BoostStatus.active &&
        boost.status !== BoostStatus.paused)
    ) {
      throw new BadRequestException(
        i18nMessage("server.admin.adPackage.extendActiveOrPausedOnly"),
      );
    }
    if (days < 1 || days > 365) {
      throw new BadRequestException(
        i18nMessage("server.admin.adPackage.extensionRange"),
      );
    }

    if (boost.status === BoostStatus.paused) {
      await this.prisma.productBoost.update({
        where: { id },
        data: {
          pausedRemainingSeconds:
            (boost.pausedRemainingSeconds ?? 0) + days * 24 * 60 * 60,
          extendedDays: { increment: days },
        },
      });
    } else {
      const base =
        boost.endsAt && boost.endsAt > new Date() ? boost.endsAt : new Date();
      await this.prisma.productBoost.update({
        where: { id },
        data: {
          endsAt: new Date(base.getTime() + days * 24 * 60 * 60 * 1000),
          extendedDays: { increment: days },
        },
      });
    }
    await this.refreshProductPromotion(boost.productId);
    return this.getPurchase(id);
  }

  private async refreshProductPromotion(productId: string) {
    const now = new Date();
    const [product, activeBoosts] = await Promise.all([
      this.prisma.product.findUnique({
        where: { id: productId },
        select: {
          sellerId: true,
          qualityScore: true,
          popularityScore: true,
          seller: {
            select: {
              businessStatus: true,
              companyName: true,
              taxId: true,
              membership: {
                select: {
                  status: true,
                  currentPeriodEnd: true,
                  tier: { select: { type: true, isActive: true } },
                },
              },
            },
          },
        },
      }),
      this.prisma.productBoost.findMany({
        where: {
          productId,
          status: BoostStatus.active,
          endsAt: { gt: now },
        },
        select: {
          endsAt: true,
          purchasedAt: true,
          showcaseOnHome: true,
        },
        orderBy: { endsAt: "desc" },
      }),
    ]);
    if (!product) return;

    const promotedUntil = activeBoosts[0]?.endsAt ?? null;
    const latestPurchase = activeBoosts.reduce<Date | null>(
      (latest, item) =>
        item.purchasedAt && (!latest || item.purchasedAt > latest)
          ? item.purchasedAt
          : latest,
      null,
    );
    const homeShowcaseUntil =
      activeBoosts.find((item) => item.showcaseOnHome)?.endsAt ?? null;
    const premium = isPremiumEntitled(
      product.seller.membership,
      product.seller,
    );
    const rankTier = promotedUntil ? 2 : premium ? 1 : 0;

    await this.prisma.product.update({
      where: { id: productId },
      data: {
        boostedUntil: promotedUntil,
        boostedAt: promotedUntil ? latestPurchase : null,
        homeShowcaseUntil,
        rankTier,
        relevanceScore: computeRelevanceScore({
          rankTier,
          qualityScore: product.qualityScore ?? 0,
          popularityScore: product.popularityScore,
        }),
      },
    });
  }
}
