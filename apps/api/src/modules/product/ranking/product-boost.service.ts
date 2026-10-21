import {
  Injectable,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  Logger,
} from "@nestjs/common";
import { Request } from "express";
import { PrismaService } from "../../../prisma";
import { i18nMessage } from "../../i18n";
import {
  ProductKind,
  ProductStatus,
  OrderOrigin,
  OrderStatus,
  MembershipTierType,
  Prisma,
} from "@prisma/client";
import { REFERENCE_PREFIX } from "../../../common/helpers/code-prefixes";
import { generateUniqueReference } from "../../../common/helpers/generate-reference";
import { boostTierBasePrice } from "../helpers/product-sale-window";
import {
  effectiveMembershipTierType,
  isPremiumEntitled,
} from "../../membership/helpers/membership.util";
import { PaymentService } from "../../payment/payment.service";
import { PaymentProvider } from "../../payment/dto";
import {
  BOOST_ENABLED_SETTING,
  type BoostOptionsResponse,
  isBoostEnabled as isBoostSettingOn,
} from "@tarodan/types";

/** What the seller chose in the boost dialog. */
export interface InitiateBoostInput {
  packageId: string;
  durationDays: number;
  provider: PaymentProvider;
  /** Asks for the ending-soon reminder; kept only for premium members. */
  autoRenew: boolean;
}

/**
 * Boost purchase flow.
 *
 * It mirrors the membership purchase: a virtual product `boost-<boostId>`, a
 * normal Order and PaymentService.initiatePayment. When the payment succeeds,
 * the payment callback (boost branch) activates the ProductBoost through
 * `BoostTimelineService`. The price always comes from the ad package tier for
 * the listing's price; the legacy flat 3/7/30-day prices are retired.
 */
@Injectable()
export class ProductBoostService {
  private readonly logger = new Logger(ProductBoostService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly paymentService: PaymentService,
  ) {}

  /** Whether boost sales are on (`isBoostEnabled`: a missing row means on). */
  async isBoostEnabled(): Promise<boolean> {
    const setting = await this.prisma.platformSetting.findUnique({
      where: { settingKey: BOOST_ENABLED_SETTING },
      select: { settingValue: true },
    });
    return isBoostSettingOn(setting?.settingValue);
  }

  /** The campaign price while its (optional) window is open, else the list price. */
  private effectiveTierPrice(tier: {
    price: unknown;
    campaignPrice: unknown;
    campaignStartsAt: Date | null;
    campaignEndsAt: Date | null;
  }): number {
    const base = Number(tier.price);
    if (tier.campaignPrice == null) return base;
    const now = new Date();
    if (tier.campaignStartsAt && now < tier.campaignStartsAt) return base;
    if (tier.campaignEndsAt && now > tier.campaignEndsAt) return base;
    return Number(tier.campaignPrice);
  }

  /**
   * Alıcının EFEKTİF üyelik katmanı — paket hedeflemesi GEÇERLİ üyelik ister.
   * Tek doğruluk kaynağı `effectiveMembershipTierType`: durum + dönem sonu +
   * tier.isActive + business için KYC şartı; hak yoksa "free". (Eskiden burada
   * yalnız status+dönem türetiliyordu: KYC'si iptal edilmiş business üye veya
   * pasifleştirilmiş tier hâlâ hedefli paketleri açabiliyordu.)
   */
  private async resolveAudienceTierType(
    userId: string,
  ): Promise<MembershipTierType> {
    const membership = await this.prisma.userMembership.findUnique({
      where: { userId },
      select: {
        status: true,
        currentPeriodEnd: true,
        tier: { select: { type: true, isActive: true } },
        user: {
          select: {
            businessStatus: true,
            companyName: true,
            taxId: true,
          },
        },
      },
    });
    return effectiveMembershipTierType(membership, membership?.user);
  }

  private eligibleAudienceWhere(
    userId: string,
    tierType: MembershipTierType,
  ): Prisma.AdPackageWhereInput {
    return {
      OR: [
        { audienceMode: "everyone" },
        {
          audienceMode: "membership_tiers",
          targetTiers: { some: { tierType } },
        },
        {
          audienceMode: "specific_users",
          targetUsers: { some: { userId } },
        },
        {
          audienceMode: "tiers_or_users",
          OR: [
            { targetTiers: { some: { tierType } } },
            { targetUsers: { some: { userId } } },
          ],
        },
      ],
    };
  }

  /** Ürün fiyatına göre (paket, süre) için aktif kademeyi çöz → efektif fiyat. */
  private async resolvePackagePrice(
    packageId: string,
    durationDays: number,
    productPrice: number,
    userId: string,
  ): Promise<{ price: number; packageName: string; showcaseOnHome: boolean }> {
    const tierType = await this.resolveAudienceTierType(userId);
    const pkg = await this.prisma.adPackage.findFirst({
      where: {
        id: packageId,
        isActive: true,
        ...this.eligibleAudienceWhere(userId, tierType),
      },
      select: { id: true, name: true, showcaseOnHome: true },
    });
    if (!pkg) {
      throw new BadRequestException(
        i18nMessage("server.product.boostPackageNotFound"),
      );
    }
    const tier = await this.prisma.adPackageTier.findFirst({
      where: {
        packageId,
        durationDays,
        isActive: true,
        minAmount: { lte: productPrice },
        OR: [{ maxAmount: null }, { maxAmount: { gte: productPrice } }],
      },
    });
    if (!tier) {
      throw new BadRequestException(
        i18nMessage("server.product.boostPriceUndefined"),
      );
    }
    return {
      price: this.effectiveTierPrice(tier),
      packageName: pkg.name,
      showcaseOnHome: pkg.showcaseOnHome,
    };
  }

  /**
   * The packages the seller can buy for a listing: the tiers matching the
   * listing's price, per package and duration (the boost dialog renders them).
   *
   * Only the owner of an active listing: anyone else gets the same 404 as for
   * a missing listing (no existence leak, and no prices of packages targeted
   * at specific users); the owner of an inactive listing gets 400.
   */
  async getBoostOptions(
    productId: string,
    userId: string,
  ): Promise<BoostOptionsResponse> {
    const product = await this.prisma.product.findFirst({
      where: { id: productId, kind: ProductKind.listing },
      select: {
        id: true,
        sellerId: true,
        status: true,
        price: true,
        oldPrice: true,
      },
    });
    if (!product || product.sellerId !== userId) {
      throw new NotFoundException(i18nMessage("server.product.notFound"));
    }
    if (product.status !== ProductStatus.active) {
      throw new BadRequestException(
        i18nMessage("server.product.boostActiveOnly"),
      );
    }
    const productPrice = boostTierBasePrice(product);
    const enabled = await this.isBoostEnabled();
    const tierType = await this.resolveAudienceTierType(userId);

    const packages = await this.prisma.adPackage.findMany({
      where: {
        isActive: true,
        ...this.eligibleAudienceWhere(userId, tierType),
      },
      orderBy: { sortOrder: "asc" },
      include: {
        tiers: {
          where: {
            isActive: true,
            minAmount: { lte: productPrice },
            OR: [{ maxAmount: null }, { maxAmount: { gte: productPrice } }],
          },
          orderBy: { durationDays: "asc" },
        },
      },
    });

    return {
      enabled,
      productPrice,
      packages: packages
        .map((p) => ({
          id: p.id,
          name: p.name,
          slug: p.slug,
          showcaseOnHome: p.showcaseOnHome,
          options: p.tiers.map((t) => ({
            durationDays: t.durationDays,
            price: this.effectiveTierPrice(t),
            listPrice: Number(t.price),
            campaign: this.effectiveTierPrice(t) < Number(t.price),
            label: `${t.durationDays} gün`,
          })),
        }))
        // a package without a tier for this price is not offered
        .filter((p) => p.options.length > 0),
    };
  }

  /**
   * Starts a boost purchase: validate, then ProductBoost (pending), the
   * virtual product and the Order, then the payment intent.
   *
   * The price is resolved on the server from the package tier for the
   * listing's price (never trusted from the client).
   */
  async initiateBoost(
    userId: string,
    productId: string,
    input: InitiateBoostInput,
    req?: Request,
  ) {
    const { packageId, durationDays, provider, autoRenew } = input;
    if (!(await this.isBoostEnabled())) {
      throw new BadRequestException(
        i18nMessage("server.product.boostUnavailable"),
      );
    }

    // Listing, ownership and status
    const product = await this.prisma.product.findFirst({
      where: { id: productId, kind: ProductKind.listing },
      select: {
        id: true,
        sellerId: true,
        status: true,
        title: true,
        categoryId: true,
        price: true,
        oldPrice: true,
      },
    });
    if (!product) {
      throw new NotFoundException(i18nMessage("server.product.notFound"));
    }
    if (product.sellerId !== userId) {
      throw new ForbiddenException(i18nMessage("server.product.boostOwnOnly"));
    }
    if (product.status !== ProductStatus.active) {
      throw new BadRequestException(
        i18nMessage("server.product.boostActiveOnly"),
      );
    }

    const { price, packageName, showcaseOnHome } =
      await this.resolvePackagePrice(
        packageId,
        durationDays,
        boostTierBasePrice(product),
        userId,
      );
    if (price <= 0) {
      throw new BadRequestException(
        i18nMessage("server.product.boostPriceUndefined"),
      );
    }

    // The platform seller and a default category (for the virtual product)
    const platformSeller = await this.prisma.user.findFirst({
      where: { email: "platform@tarodan.com", sellerType: "platform" },
    });
    if (!platformSeller) {
      throw new NotFoundException(
        i18nMessage("server.product.platformSellerNotFound"),
      );
    }
    const defaultCategory = await this.prisma.category.findFirst({
      where: { isActive: true },
    });
    if (!defaultCategory) {
      throw new NotFoundException(
        i18nMessage("server.product.categoryNotFound"),
      );
    }

    // The reminder flag (`autoRenew`) is kept only for premium members
    let effectiveAutoRenew = false;
    if (autoRenew) {
      const membership = await this.prisma.userMembership.findUnique({
        where: { userId },
        select: {
          status: true,
          currentPeriodEnd: true,
          tier: { select: { type: true, isActive: true } },
          user: {
            select: {
              businessStatus: true,
              companyName: true,
              taxId: true,
            },
          },
        },
      });
      effectiveAutoRenew = isPremiumEntitled(membership, membership?.user);
    }

    // The ProductBoost row (pending)
    const boost = await this.prisma.productBoost.create({
      data: {
        productId: product.id,
        userId,
        packageId,
        packageName,
        showcaseOnHome,
        durationDays,
        price,
        status: "pending",
        autoRenew: effectiveAutoRenew,
      },
    });

    try {
      // Virtual product: boost-<boostId>
      const virtualProductId = `boost-${boost.id}`;
      await this.prisma.product.create({
        data: {
          id: virtualProductId,
          sellerId: platformSeller.id,
          categoryId: defaultCategory.id,
          // Stored text of the virtual product (order and admin screens).
          title: `${packageName} — İlan Öne Çıkarma (${durationDays} gün)`,
          description: `"${product.title}" ilanı için ${packageName} ${durationDays} günlük öne çıkarma`,
          price,
          condition: "new",
          kind: ProductKind.boost,
          status: ProductStatus.active,
        },
      });

      const orderNumber = await generateUniqueReference(
        REFERENCE_PREFIX.boostOrder,
        async (code) =>
          (await this.prisma.order.count({ where: { orderNumber: code } })) > 0,
      );

      const order = await this.prisma.order.create({
        data: {
          orderNumber,
          buyerId: userId,
          sellerId: platformSeller.id,
          productId: virtualProductId,
          origin: OrderOrigin.platform_service,
          totalAmount: price,
          commissionAmount: 0,
          shippingCost: 0,
          status: OrderStatus.pending_payment,
          paymentExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
          // A virtual order ships nothing; the marker links it to its boost.
          shippingAddress: { type: "boost", boostId: boost.id },
        },
      });

      // Link the order to the boost (the payment callback finds it by orderId)
      await this.prisma.productBoost.update({
        where: { id: boost.id },
        data: { orderId: order.id },
      });

      const paymentResult = await this.paymentService.initiatePayment(
        userId,
        { orderId: order.id, provider },
        req,
      );

      // Payment intent: the card is entered through /payments/direct-form (no iframe).
      return {
        boostId: boost.id,
        productId: product.id,
        durationDays,
        price,
        paymentId: paymentResult.paymentId,
        provider: paymentResult.provider,
        expiresIn: paymentResult.expiresIn || 300,
        useBypass:
          (paymentResult as { useBypass?: boolean }).useBypass === true,
      };
    } catch (error) {
      // If the payment cannot start, mark the pending boost failed. A failure
      // here must not hide the original error, and the expiry sweep marks a
      // stale pending boost failed anyway.
      await this.prisma.productBoost
        .update({ where: { id: boost.id }, data: { status: "failed" } })
        .catch(() => undefined);
      throw error;
    }
  }

  /** Kullanıcının boost'ları (en yeni önce) + ürün özeti. */
  async getMyBoosts(userId: string) {
    const boosts = await this.prisma.productBoost.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      include: {
        product: {
          select: {
            id: true,
            title: true,
            status: true,
            viewCount: true,
            likeCount: true,
            clickCount: true,
            images: { orderBy: { sortOrder: "asc" }, take: 1 },
          },
        },
      },
    });

    const now = new Date();
    const rows = boosts.map((b) => {
      const current = {
        views: b.finalViewCount ?? b.product?.viewCount ?? 0,
        likes: b.finalLikeCount ?? b.product?.likeCount ?? 0,
        clicks: b.finalClickCount ?? b.product?.clickCount ?? 0,
      };
      const before =
        b.baselineViewCount == null
          ? null
          : {
              views: b.baselineViewCount,
              likes: b.baselineLikeCount ?? 0,
              clicks: b.baselineClickCount ?? 0,
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

      return {
        id: b.id,
        productId: b.productId,
        product: b.product
          ? {
              id: b.product.id,
              title: b.product.title,
              status: b.product.status,
              image: b.product.images[0]?.cardKey ?? null,
            }
          : null,
        packageName: b.packageName,
        durationDays: b.durationDays,
        extendedDays: b.extendedDays,
        price: Number(b.price),
        status: b.status,
        autoRenew: b.autoRenew,
        startsAt: b.startsAt?.toISOString() ?? null,
        endsAt: b.endsAt?.toISOString() ?? null,
        isActive: b.status === "active" && b.endsAt != null && b.endsAt > now,
        remainingMs:
          b.status === "active" && b.endsAt != null && b.endsAt > now
            ? b.endsAt.getTime() - now.getTime()
            : b.status === "paused"
              ? (b.pausedRemainingSeconds ?? 0) * 1000
              : 0,
        metrics: { before, current, gain, performanceScore },
        createdAt: b.createdAt.toISOString(),
      };
    });
    const bestScore = rows.reduce(
      (best, row) => Math.max(best, row.metrics.performanceScore ?? -1),
      -1,
    );
    return rows.map((row) => ({
      ...row,
      isBest:
        row.metrics.performanceScore != null &&
        row.metrics.performanceScore === bestScore,
    }));
  }
}
