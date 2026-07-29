import {
  Injectable,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  Logger,
} from "@nestjs/common";
import { Request } from "express";
import { PrismaService } from "../../prisma";
import { i18nMessage } from "../i18n";
import { ProductStatus, OrderStatus, Prisma } from "@prisma/client";
import { isPremiumEntitled } from "../membership/membership.util";
import { PaymentService } from "../payment/payment.service";
import { PaymentProvider } from "../payment/dto";
import { BOOST_DURATIONS, BoostPricingOption } from "./dto/boost.dto";

/**
 * Boost (öne çıkarma) satın alma akışı.
 *
 * Üyelik satın alma akışını birebir taklit eder: `boost-<boostId>` ön ekli sanal ürün +
 * normal Order + PaymentService.initiatePayment. Ödeme başarıyla tamamlanınca
 * PaymentService callback'i (boost- dalı) ProductBoost'u aktive eder ve ürünü
 * sponsorlu kademesine (rankTier=2) alır.
 */
@Injectable()
export class ProductBoostService {
  private readonly logger = new Logger(ProductBoostService.name);

  // PlatformSetting bulunmazsa kullanılacak varsayılan fiyatlar (TL)
  private readonly DEFAULT_PRICES: Record<number, number> = {
    3: 29,
    7: 59,
    30: 149,
  };

  constructor(
    private readonly prisma: PrismaService,
    private readonly paymentService: PaymentService,
  ) {}

  private settingKeyFor(durationDays: number): string {
    return `boost_price_${durationDays}d`;
  }

  /** Boost özelliği admin tarafından kapatılmış mı? */
  async isBoostEnabled(): Promise<boolean> {
    const setting = await this.prisma.platformSetting.findUnique({
      where: { settingKey: "boost_enabled" },
    });
    if (!setting) return true; // varsayılan: açık
    return setting.settingValue !== "false";
  }

  /** Belirli bir süre için fiyatı döndürür (PlatformSetting → varsayılan). */
  async getPriceForDuration(durationDays: number): Promise<number> {
    const setting = await this.prisma.platformSetting.findUnique({
      where: { settingKey: this.settingKeyFor(durationDays) },
    });
    const parsed = setting?.settingValue
      ? parseFloat(setting.settingValue)
      : NaN;
    if (!isNaN(parsed) && parsed >= 0) return parsed;
    return this.DEFAULT_PRICES[durationDays] ?? 0;
  }

  /** Tüm boost süreleri + fiyatları (admin'den ayarlanabilir). */
  async getPricing(): Promise<{
    enabled: boolean;
    options: BoostPricingOption[];
  }> {
    const enabled = await this.isBoostEnabled();
    const options: BoostPricingOption[] = [];
    for (const durationDays of BOOST_DURATIONS) {
      const price = await this.getPriceForDuration(durationDays);
      options.push({ durationDays, price, label: `${durationDays} gün` });
    }
    return { enabled, options };
  }

  /** Kampanya fiyatı geçerli mi (opsiyonel tarih penceresi açık)? → efektif fiyat. */
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

  private eligibleAudienceWhere(
    userId: string,
    tierType: "free" | "basic" | "premium" | "business",
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
    const membership = await this.prisma.userMembership.findUnique({
      where: { userId },
      select: { tier: { select: { type: true } } },
    });
    const tierType = membership?.tier.type ?? "free";
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
   * Bir ürün için satın alınabilir paket seçenekleri: ürünün fiyatına uyan
   * kademeleri paket + süre bazında döndürür (modal bunu render eder).
   */
  async getBoostOptions(productId: string, userId: string) {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      select: { id: true, price: true },
    });
    if (!product) {
      throw new NotFoundException(i18nMessage("server.product.notFound"));
    }
    const productPrice = Number(product.price);
    const enabled = await this.isBoostEnabled();
    const membership = await this.prisma.userMembership.findUnique({
      where: { userId },
      select: { tier: { select: { type: true } } },
    });
    const tierType = membership?.tier.type ?? "free";

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
        // paketin bu fiyat için hiç kademesi yoksa listeleme
        .filter((p) => p.options.length > 0),
    };
  }

  /**
   * Boost satın almayı başlatır: doğrula → ProductBoost(pending) + sanal ürün + Order →
   * ödeme başlat. Ödeme URL'sini döndürür.
   *
   * `packageId` verilirse yeni paket/kademe fiyatlandırması (ürün fiyatına göre);
   * verilmezse eski düz `boost_price_*` fiyatı (geçiş dönemi geriye-dönük uyumu).
   */
  async initiateBoost(
    userId: string,
    productId: string,
    durationDays: number,
    provider: PaymentProvider = PaymentProvider.paytr,
    autoRenew = false,
    req?: Request,
    packageId?: string,
  ) {
    if (!packageId && !BOOST_DURATIONS.includes(durationDays as any)) {
      throw new BadRequestException(
        i18nMessage("server.product.invalidBoostDuration"),
      );
    }

    if (!(await this.isBoostEnabled())) {
      throw new BadRequestException(
        i18nMessage("server.product.boostUnavailable"),
      );
    }

    // Ürün + sahiplik + durum doğrula
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      select: {
        id: true,
        sellerId: true,
        status: true,
        title: true,
        categoryId: true,
        price: true,
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

    // Fiyat + paket bilgisi HER ZAMAN serverda çözülür (istemciye güvenilmez).
    let price: number;
    let packageName: string | null = null;
    let showcaseOnHome = false;
    if (packageId) {
      const resolved = await this.resolvePackagePrice(
        packageId,
        durationDays,
        Number(product.price),
        userId,
      );
      price = resolved.price;
      packageName = resolved.packageName;
      showcaseOnHome = resolved.showcaseOnHome;
    } else {
      price = await this.getPriceForDuration(durationDays);
    }
    if (price <= 0) {
      throw new BadRequestException(
        i18nMessage("server.product.boostPriceUndefined"),
      );
    }

    // Platform satıcısı + varsayılan kategori (sanal ürün için)
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

    // Otomatik yenileme yalnızca premium (ücretli, aktif) üyelere
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

    // ProductBoost kaydı (pending)
    const boost = await this.prisma.productBoost.create({
      data: {
        productId: product.id,
        userId,
        packageId: packageId ?? null,
        packageName,
        showcaseOnHome,
        durationDays,
        price,
        status: "pending",
        autoRenew: effectiveAutoRenew,
      },
    });

    try {
      // Sanal ürün: boost-<boostId>
      const virtualProductId = `boost-${boost.id}`;
      await this.prisma.product.create({
        data: {
          id: virtualProductId,
          sellerId: platformSeller.id,
          categoryId: defaultCategory.id,
          title: packageName
            ? `${packageName} — İlan Öne Çıkarma (${durationDays} gün)`
            : `İlan Öne Çıkarma (${durationDays} gün)`,
          description: `"${product.title}" ilanı için ${
            packageName ? `${packageName} ` : ""
          }${durationDays} günlük öne çıkarma`,
          price,
          condition: "new",
          status: ProductStatus.active,
        },
      });

      const orderNumber = `BOOST-${Date.now()}-${Math.random()
        .toString(36)
        .substr(2, 9)
        .toUpperCase()}`;

      const order = await this.prisma.order.create({
        data: {
          orderNumber,
          buyerId: userId,
          sellerId: platformSeller.id,
          productId: virtualProductId,
          totalAmount: price,
          commissionAmount: 0,
          shippingCost: 0,
          status: OrderStatus.pending_payment,
          paymentExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
          shippingAddress: { type: "boost", boostId: boost.id } as any,
        },
      });

      // Order'ı boost'a bağla (callback orderId ile bulacak)
      await this.prisma.productBoost.update({
        where: { id: boost.id },
        data: { orderId: order.id },
      });

      const paymentResult = await this.paymentService.initiatePayment(
        userId,
        { orderId: order.id, provider },
        req,
      );

      // Ödeme niyeti (intent): kart bilgisi /payments/direct-form ile alınır (iframe yok).
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
      // Ödeme başlatılamazsa pending boost'u temizle
      await this.prisma.productBoost
        .update({ where: { id: boost.id }, data: { status: "failed" } })
        .catch(() => {});
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
