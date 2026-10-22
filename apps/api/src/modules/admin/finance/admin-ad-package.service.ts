import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from "@nestjs/common";
import {
  AdPackage,
  AdPackageAudienceMode,
  AdPackageTier,
  BoostSource,
  BoostStatus,
  MembershipTierType,
  Prisma,
} from "@prisma/client";
import { PrismaService } from "../../../prisma";
import { BoostTimelineService } from "../../product/boost-timeline/boost-timeline.service";
import {
  CreateAdPackageDto,
  UpdateAdPackageDto,
  AdPackageTierDto,
} from "../dto/ad-package.dto";
import { paginate } from "../../../common/list";
import { i18nMessage } from "../../i18n";
import { boostRefundableAmount } from "./boost/boost-refund-policy";
import {
  boostTierBandIsEmpty,
  findBoostTierOverlaps,
} from "../../product/helpers/boost-tier-band";

const isBoostStatus = (value: string): value is BoostStatus =>
  (Object.values(BoostStatus) as string[]).includes(value);
const isBoostSource = (value: string): value is BoostSource =>
  (Object.values(BoostSource) as string[]).includes(value);

/** The staff user who granted or stopped a boost, by name only. */
const STAFF_SELECT = {
  id: true,
  displayName: true,
} satisfies Prisma.UserSelect;

/** A package as the admin reads it: the row plus whichever relations it loaded. */
type PackageRow = AdPackage & {
  tiers?: AdPackageTier[];
  targetTiers?: Array<{ tierType: MembershipTierType }>;
  targetUsers?: Array<{
    user: {
      id: string;
      adminCode: string | null;
      username: string | null;
      displayName: string;
      email: string;
    };
  }>;
};

/**
 * What a package response loads: tiers in display order and the audience. The
 * target users are read for their public admin identity only (the create and
 * update paths used to load whole user rows).
 */
const PACKAGE_INCLUDE = {
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
} satisfies Prisma.AdPackageInclude;

/** The engagement counters a purchase's before/after metrics read. */
type MetricsRow = {
  baselineViewCount: number | null;
  baselineLikeCount: number | null;
  baselineClickCount: number | null;
  finalViewCount: number | null;
  finalLikeCount: number | null;
  finalClickCount: number | null;
  product: { viewCount: number; likeCount: number; clickCount: number } | null;
};

/** What the purchase list and detail load for each boost. */
const PURCHASE_INCLUDE = {
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
  grantedBy: { select: STAFF_SELECT },
  cancelledBy: { select: STAFF_SELECT },
} satisfies Prisma.ProductBoostInclude;

/** The boost order and its payment (a boost row has no relation to them). */
const PURCHASE_ORDER_SELECT = {
  id: true,
  orderNumber: true,
  payment: {
    select: { id: true, status: true, amount: true, metadata: true },
  },
} satisfies Prisma.OrderSelect;

type PurchaseOrder = Prisma.OrderGetPayload<{
  select: typeof PURCHASE_ORDER_SELECT;
}>;

type PurchaseRow = Prisma.ProductBoostGetPayload<{
  include: typeof PURCHASE_INCLUDE;
}>;

/**
 * Admin management of the dynamic ad/boost packages (Ekonomik / Vitrin / …) and
 * their price tiers, plus read-only tracking of every boost purchase (who bought
 * which package for which product, when, for how much).
 */
@Injectable()
export class AdminAdPackageService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly boostTimeline: BoostTimelineService,
  ) {}

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

  /**
   * Refuses tier rows the lookups could not price unambiguously, before any
   * write: a band whose upper bound is not above its lower bound, and two
   * active rows of one duration whose bands overlap (half-open,
   * `boost-tier-band.ts`). Bands may touch (1000-5000 and 5000-none). The
   * 400 names the rows (`tierIndexes`, their positions in `tiers`) so the
   * admin form can mark them.
   */
  private assertTiersPriceable(tiers: AdPackageTierDto[]): void {
    const empty = tiers.findIndex((tier) => boostTierBandIsEmpty(tier));
    if (empty !== -1) {
      throw new BadRequestException({
        ...i18nMessage("server.admin.commission.maxAboveMin"),
        tierIndexes: [empty],
      });
    }
    const [overlap] = findBoostTierOverlaps(tiers);
    if (overlap) {
      const first = tiers[overlap.first];
      const second = tiers[overlap.second];
      throw new BadRequestException({
        ...i18nMessage("server.admin.adPackage.tierOverlap", {
          durationDays: first.durationDays,
          firstMin: first.minAmount,
          firstMax: first.maxAmount ?? "none",
          secondMin: second.minAmount,
          secondMax: second.maxAmount ?? "none",
        }),
        tierIndexes: [overlap.first, overlap.second],
      });
    }
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

  private serialize(pkg: PackageRow) {
    return {
      id: pkg.id,
      name: pkg.name,
      slug: pkg.slug,
      showcaseOnHome: pkg.showcaseOnHome,
      isActive: pkg.isActive,
      sortOrder: pkg.sortOrder,
      audienceMode: pkg.audienceMode,
      targetTierTypes: (pkg.targetTiers ?? []).map((t) => t.tierType),
      targetUsers: (pkg.targetUsers ?? []).map((target) => ({
        id: target.user.id,
        adminCode: target.user.adminCode,
        username: target.user.username,
        displayName: target.user.displayName,
        email: target.user.email,
      })),
      createdAt: pkg.createdAt,
      tiers: (pkg.tiers ?? []).map((t) => ({
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

  private purchaseMetrics(boost: MetricsRow) {
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

  /** The orders of these boosts, in one query (no N+1 on the list). */
  private async purchaseOrders(
    boosts: Array<{ orderId: string | null }>,
  ): Promise<Map<string, PurchaseOrder>> {
    const ids = [
      ...new Set(boosts.flatMap((b) => (b.orderId ? [b.orderId] : []))),
    ];
    if (ids.length === 0) return new Map();
    const orders = await this.prisma.order.findMany({
      where: { id: { in: ids } },
      select: PURCHASE_ORDER_SELECT,
    });
    return new Map(orders.map((order) => [order.id, order]));
  }

  private serializePurchase(
    boost: PurchaseRow,
    order: PurchaseOrder | undefined,
    bestScore?: number,
  ) {
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
      showcaseEndsAt: boost.showcaseEndsAt,
      /** `purchase` or a free `admin_grant` (no order, payment or invoice). */
      source: boost.source,
      grantedBy: boost.grantedBy
        ? { id: boost.grantedBy.id, name: boost.grantedBy.displayName }
        : null,
      grantReason: boost.grantReason,
      cancelledAt: boost.cancelledAt,
      cancelledBy: boost.cancelledBy
        ? { id: boost.cancelledBy.id, name: boost.cancelledBy.displayName }
        : null,
      cancelReason: boost.cancelReason,
      refundedAmount: Number(boost.refundedAmount ?? 0),
      /** The most "refund and stop" may return now; 0 when it is not allowed. */
      refundableAmount: boostRefundableAmount({
        ...boost,
        payment: order?.payment ?? null,
      }).toNumber(),
      orderId: boost.orderId,
      orderNumber: order?.orderNumber ?? null,
      paymentId: order?.payment?.id ?? null,
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
      include: PACKAGE_INCLUDE,
    });
    return { data: packages.map((p) => this.serialize(p)) };
  }

  async createPackage(dto: CreateAdPackageDto) {
    this.assertTiersPriceable(dto.tiers ?? []);
    const existing = await this.prisma.adPackage.findUnique({
      where: { slug: dto.slug },
    });
    if (existing) {
      throw new BadRequestException(
        i18nMessage("server.admin.adPackage.slugTaken"),
      );
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
      include: PACKAGE_INCLUDE,
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
    if (dto.tiers) this.assertTiersPriceable(dto.tiers);

    if (dto.slug && dto.slug !== pkg.slug) {
      const clash = await this.prisma.adPackage.findUnique({
        where: { slug: dto.slug },
      });
      if (clash)
        throw new BadRequestException(
          i18nMessage("server.admin.adPackage.slugTaken"),
        );
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
      // "Add or remove rows": when given, the tier rows are replaced wholesale.
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
      return tx.adPackage.findUniqueOrThrow({
        where: { id },
        include: PACKAGE_INCLUDE,
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
    // Cascade deletes tiers; ProductBoost.packageId → SetNull (history kept).
    await this.prisma.adPackage.delete({ where: { id } });
    return { success: true };
  }

  /** Boost purchase tracking: who bought which package for which listing, when, for how much. */
  async listPurchases(query: {
    page?: number;
    limit?: number;
    packageId?: string;
    status?: string;
    source?: string;
    search?: string;
  }) {
    const { page = 1, limit = 20, packageId, status, source, search } = query;
    const where: Prisma.ProductBoostWhereInput = {};
    if (packageId) where.packageId = packageId;
    // An unknown status filters nothing (it used to reach Prisma and 500).
    if (status && isBoostStatus(status)) where.status = status;
    if (source && isBoostSource(source)) where.source = source;
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
        include: PURCHASE_INCLUDE,
      },
      { page, limit },
    );

    const orders = await this.purchaseOrders(result.data);
    return {
      ...result,
      data: result.data.map((boost) =>
        this.serializePurchase(
          boost,
          boost.orderId ? orders.get(boost.orderId) : undefined,
        ),
      ),
    };
  }

  async getPurchase(id: string) {
    const boost = await this.prisma.productBoost.findUnique({
      where: { id },
      include: PURCHASE_INCLUDE,
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
    const orders = await this.purchaseOrders([boost]);
    return this.serializePurchase(
      boost,
      boost.orderId ? orders.get(boost.orderId) : undefined,
      bestScore,
    );
  }

  /** Pause, resume and extend change the listing timeline: its owner does it. */
  async pausePurchase(id: string) {
    await this.prisma.$transaction((tx) => this.boostTimeline.pause(tx, id));
    return this.getPurchase(id);
  }

  async resumePurchase(id: string) {
    await this.prisma.$transaction((tx) => this.boostTimeline.resume(tx, id));
    return this.getPurchase(id);
  }

  async extendPurchase(id: string, days: number) {
    await this.prisma.$transaction((tx) =>
      this.boostTimeline.extend(tx, id, days),
    );
    return this.getPurchase(id);
  }
}
