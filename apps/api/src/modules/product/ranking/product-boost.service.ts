import {
  Injectable,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  Logger,
  Optional,
} from "@nestjs/common";
import { Request } from "express";
import { PrismaService } from "../../../prisma";
import { i18nMessage } from "../../i18n";
import {
  ProductKind,
  ProductStatus,
  OrderOrigin,
  OrderStatus,
} from "@prisma/client";
import { REFERENCE_PREFIX } from "../../../common/helpers/code-prefixes";
import { generateUniqueReference } from "../../../common/helpers/generate-reference";
import { boostTierBasePrice } from "../helpers/product-sale-window";
import {
  BoostAudienceService,
  eligibleAudienceWhere,
  tierCoversPriceWhere,
} from "../boost-seller/boost-audience.service";
import { PaymentService } from "../../payment/payment.service";
import { PaymentProvider } from "../../payment/dto";
import { boostVirtualProductId } from "../../payment/helpers/virtual-order-kind";
import {
  PlatformServiceConsentService,
  platformServiceConsentsAccepted,
  type PlatformServiceConsentInput,
} from "../../consent/platform-service-consent.service";
import { SentryService } from "../../sentry/sentry.service";
import {
  boostBreadcrumb,
  tagBoostRequest,
} from "../helpers/boost-observability";
import {
  BOOST_ENABLED_SETTING,
  type BoostOptionsResponse,
  boostPriceMatches,
  isBoostEnabled as isBoostSettingOn,
} from "@tarodan/types";

/** What the seller chose and accepted in the boost dialog. */
export interface InitiateBoostInput extends PlatformServiceConsentInput {
  packageId: string;
  durationDays: number;
  /** The price the dialog showed (TL); must match what is charged now. */
  expectedPrice: number;
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
    private readonly platformServiceConsents: PlatformServiceConsentService,
    private readonly audience: BoostAudienceService,
    @Optional() private readonly sentry?: SentryService,
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

  /** The active tier of (package, duration) for the listing price, and its price now. */
  private async resolvePackagePrice(
    packageId: string,
    durationDays: number,
    productPrice: number,
    userId: string,
  ): Promise<{ price: number; packageName: string; showcaseOnHome: boolean }> {
    const tierType = await this.audience.audienceTierType(userId);
    const pkg = await this.prisma.adPackage.findFirst({
      where: {
        id: packageId,
        isActive: true,
        ...eligibleAudienceWhere(userId, tierType),
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
        ...tierCoversPriceWhere(productPrice),
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
    const tierType = await this.audience.audienceTierType(userId);

    const packages = await this.prisma.adPackage.findMany({
      where: {
        isActive: true,
        ...eligibleAudienceWhere(userId, tierType),
      },
      orderBy: { sortOrder: "asc" },
      include: {
        tiers: {
          where: { isActive: true, ...tierCoversPriceWhere(productPrice) },
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
   * Starts a boost purchase: validate, then one transaction writes the
   * ProductBoost (pending), the virtual product `boost-<boostId>`, the Order
   * and the two purchase consents (pre-contract information and distance
   * service contract, withdrawal waiver), and only after it commits the
   * payment intent is created. An order of a boost therefore never exists
   * without its consents, and a failed write leaves nothing behind.
   *
   * The consents are checked first: anything but `true` for both is a 400
   * `server.product.boostConsentRequired` before any read or write. No
   * setting relaxes it: mobile never buys a boost (ADR 0003, 0015) and the
   * web dialog that sends them ships in the same release.
   *
   * The price is resolved on the server from the package tier for the
   * listing's price (never trusted from the client), with the same rule the
   * options call shows. When it is not the price the seller consented to
   * (`expectedPrice`, `boostPriceMatches`: whole kuruş), the answer is 409
   * `server.product.boostPriceChanged` before any order lookup, reference or
   * write: a campaign started or ended, or the tier, the listing's price band
   * or the seller's audience changed since the options were read, and the
   * package and duration are still offered at another price. When they are
   * no longer offered at all, the earlier 400 (`boostPackageNotFound`,
   * `boostPriceUndefined`) answers instead. Every earlier refusal (consents,
   * boost off, listing, owner, status, package, tier, a zero price) wins over
   * it. The checked price is the one written, so the boost, the order, the
   * payment and the consents carry the consented price.
   */
  async initiateBoost(
    userId: string,
    productId: string,
    input: InitiateBoostInput,
    req?: Request,
  ) {
    const { packageId, durationDays, expectedPrice, provider, autoRenew } =
      input;
    tagBoostRequest(this.sentry);
    boostBreadcrumb(this.sentry, "initiate", { productId });
    if (!platformServiceConsentsAccepted(input)) {
      throw new BadRequestException(
        i18nMessage("server.product.boostConsentRequired"),
      );
    }
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
    if (!boostPriceMatches(expectedPrice, price)) {
      boostBreadcrumb(this.sentry, "price_mismatch", {
        productId,
        packageId,
        durationDays,
      });
      throw new ConflictException(
        i18nMessage("server.product.boostPriceChanged"),
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
    const effectiveAutoRenew = autoRenew
      ? await this.audience.isPremium(userId)
      : false;

    // Reads stay outside the transaction; `order_number` is unique, so a
    // code taken in between fails the write instead of being shared.
    const orderNumber = await generateUniqueReference(
      REFERENCE_PREFIX.boostOrder,
      async (code) =>
        (await this.prisma.order.count({ where: { orderNumber: code } })) > 0,
    );

    // One business event, one transaction: inserts only, no lock on an
    // existing row and nothing slow (the payment intent comes after).
    const { boost, order } = await this.prisma.$transaction(async (tx) => {
      const boost = await tx.productBoost.create({
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
      const virtualProductId = boostVirtualProductId(boost.id);
      await tx.product.create({
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
      const order = await tx.order.create({
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
      await tx.productBoost.update({
        where: { id: boost.id },
        data: { orderId: order.id },
      });
      await this.platformServiceConsents.recordForOrder(tx, {
        orderId: order.id,
        userId,
      });
      return { boost, order };
    });
    boostBreadcrumb(this.sentry, "order_created", {
      boostId: boost.id,
      orderId: order.id,
      orderNumber: order.orderNumber,
      productId: product.id,
    });

    try {
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
      // stale pending boost failed anyway. The unpaid order expires with its
      // payment window; its consents stay as the record of what was accepted.
      await this.prisma.productBoost
        .update({ where: { id: boost.id }, data: { status: "failed" } })
        .catch(() => undefined);
      throw error;
    }
  }
}
