import { Injectable, NotFoundException, Logger } from "@nestjs/common";
import { PrismaService } from "../../prisma";
import {
  MembershipTierType,
  SubscriptionStatus,
  ProductStatus,
  OrderStatus,
  PaymentStatus,
} from "@prisma/client";
import { MembershipTierResponseDto, UserMembershipResponseDto } from "./dto";
import { PaymentService } from "../payment/payment.service";
import { PaymentProvider } from "../payment/dto";
import { i18nMessage } from "../i18n";
import { isPremiumEntitled } from "./membership.util";

/**
 * MembershipCommonService — üyelik alt-servislerinin paylaştığı çekirdek okuma/
 * eşleme yardımcıları. getUserMembership (self-heal dahil) hem sorgu (facade) hem
 * abonelik (MembershipSubscriptionService) tarafından kullanıldığı için burada.
 * DI leaf: yalnız prisma + paymentService enjekte eder (döngü yok).
 */
@Injectable()
export class MembershipCommonService {
  private readonly logger = new Logger(MembershipCommonService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly paymentService: PaymentService,
  ) {}

  // ==========================================================================
  // PLATFORM İLAN LİMİTİ OVERRIDE'LARI — TEK KAYNAK
  // ==========================================================================

  private static readonly LISTING_LIMIT_SETTING_KEY: Record<
    MembershipTierType,
    string
  > = {
    [MembershipTierType.free]: "free_listing_limit",
    [MembershipTierType.basic]: "basic_listing_limit",
    [MembershipTierType.premium]: "premium_listing_limit",
    [MembershipTierType.business]: "business_listing_limit",
  };

  /**
   * Tier'ın ilan limitini geçersiz kılan PlatformSetting değeri; ayar yoksa ya
   * da geçersizse null. Free tier'da yalnız pozitif değer geçerli (sınırsız
   * ücretsiz üyelik yok); ücretli tier'larda -1 = sınırsız kabul edilir.
   */
  private async resolveListingLimitOverride(
    type: MembershipTierType,
  ): Promise<number | null> {
    const row = await this.prisma.platformSetting.findUnique({
      where: {
        settingKey: MembershipCommonService.LISTING_LIMIT_SETTING_KEY[type],
      },
    });
    if (!row?.settingValue) return null;
    const limit = parseInt(row.settingValue, 10);
    if (isNaN(limit)) return null;
    if (type === MembershipTierType.free) {
      return limit > 0 ? limit : null;
    }
    return limit === -1 || limit > 0 ? limit : null;
  }

  /**
   * Tier benzeri bir nesnenin ilan limitlerini platform override'ıyla YERİNDE
   * günceller ve aynı nesneyi döndürür.
   *
   * UYGULANAN limitin (getUserMembership → kullanım istatistikleri → ilan
   * oluşturma kapısı) ve VAAT EDİLEN limitin (`/membership/tiers` → üyelik
   * sayfası + checkout kartları) TEK kaynağı budur. Eskiden override yalnız
   * uygulama tarafında (üstelik iki yerde kopyalanmış if/else zincirleriyle)
   * vardı; admin Sistem Ayarları'ndan limiti değiştirince sayfa eski limiti
   * vaat ediyor, kullanıcı yenisine takılıyordu.
   */
  async applyListingLimitOverride<
    T extends {
      type: MembershipTierType;
      maxFreeListings: number;
      maxTotalListings: number;
    },
  >(tier: T): Promise<T> {
    const override = await this.resolveListingLimitOverride(tier.type);
    if (override == null) return tier;
    if (tier.type === MembershipTierType.free) {
      // Free'de toplam = ücretsiz: tek limit ikisini de belirler.
      tier.maxFreeListings = override;
      tier.maxTotalListings = override;
    } else {
      tier.maxTotalListings = override;
    }
    return tier;
  }

  // ==========================================================================
  // GET USER'S MEMBERSHIP
  // ==========================================================================
  async getUserMembership(userId: string): Promise<UserMembershipResponseDto> {
    const entitlementOwner = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        businessStatus: true,
        companyName: true,
        taxId: true,
      },
    });
    if (!entitlementOwner) {
      throw new NotFoundException(i18nMessage("server.user.notFound"));
    }

    let membership = await this.prisma.userMembership.findUnique({
      where: { userId },
      include: { tier: true },
    });

    // If no membership, create free tier membership
    if (!membership) {
      const freeTier = await this.prisma.membershipTier.findUnique({
        where: { type: MembershipTierType.free },
      });

      if (!freeTier) {
        throw new NotFoundException(
          i18nMessage("server.membership.freeTierNotFound"),
        );
      }

      const now = new Date();
      const oneYearLater = new Date(
        now.getFullYear() + 100,
        now.getMonth(),
        now.getDate(),
      ); // Free tier never expires

      membership = await this.prisma.userMembership.create({
        data: {
          userId,
          tierId: freeTier.id,
          status: SubscriptionStatus.active,
          currentPeriodStart: now,
          currentPeriodEnd: oneYearLater,
        },
        include: { tier: true },
      });
    }

    // Ham abonelik kaydı ödeme/mutabakat için korunur; tüm özellik kapıları
    // aşağıda hesaplanan efektif tier'ı kullanır.
    let pendingTierName: string | undefined;
    let pendingTierType: MembershipTierType | undefined;
    let pendingPayment = false;
    if (membership.status === SubscriptionStatus.past_due) {
      // SELF-HEAL: past_due görünüyor ama ödeme aslında PayTR'de başarılı olmuş
      // olabilir (callback ngrok'a düşemediğinde sipariş pending kalır). Kullanıcı
      // sayfayı açtığı an, bu döneme ait BEKLEYEN PayTR ödemesini durum-sorgu ile
      // doğrula ve tamamla → reconciliation cron'unu beklemeden anında aktive olur.
      const virtualProductId = `membership-${membership.tierId}`;
      // 1dk tolerans: sipariş, abonelikten (currentPeriodStart) hemen sonra oluşur.
      const healFloor = new Date(
        membership.currentPeriodStart.getTime() - 60 * 1000,
      );

      // (a) Bu döneme ait BEKLEYEN ödemeyi PayTR'ye sor; ödendiyse tamamla.
      const pendingPaymentRow = await this.prisma.payment.findFirst({
        where: {
          status: PaymentStatus.pending,
          provider: PaymentProvider.paytr,
          providerConversationId: { not: null },
          order: {
            buyerId: userId,
            productId: virtualProductId,
            createdAt: { gte: healFloor },
          },
        },
        orderBy: { createdAt: "desc" },
        select: { id: true },
      });
      if (pendingPaymentRow) {
        try {
          await this.paymentService.verifyPaymentFromClient(
            pendingPaymentRow.id,
            { internal: true },
          );
        } catch (err) {
          this.logger.warn(
            `Membership self-heal verify failed for payment ${pendingPaymentRow.id}: ${(err as Error)?.message}`,
          );
        }
      }

      // (b) Tamamlanmış sipariş var mı (verify ya da cron'un işlediği) → aktive et.
      const paidOrder = await this.prisma.order.findFirst({
        where: {
          buyerId: userId,
          productId: virtualProductId,
          status: {
            in: [
              OrderStatus.completed,
              OrderStatus.delivered,
              OrderStatus.paid,
              OrderStatus.preparing,
            ],
          },
          createdAt: { gte: healFloor },
        },
        orderBy: { createdAt: "desc" },
      });

      // Üyelik (verify aktivasyonu sonrası) güncel durumu yeniden oku.
      const fresh = await this.prisma.userMembership.findUnique({
        where: { userId },
        include: { tier: true },
      });
      if (fresh) membership = fresh;

      if (membership.status === SubscriptionStatus.active) {
        // verify zaten aktive etti; banner gösterme.
      } else if (paidOrder) {
        membership = await this.prisma.userMembership.update({
          where: { userId },
          data: { status: SubscriptionStatus.active, cancelledAt: null },
          include: { tier: true },
        });
        this.logger.log(
          `Self-healed membership ${membership.id} past_due → active (paid order ${paidOrder.orderNumber})`,
        );
      } else {
        pendingTierName = membership.tier.name;
        pendingTierType = membership.tier.type;
        pendingPayment = true;
      }
    }

    let effectiveTier = { ...membership.tier };
    if (
      membership.tier.type !== MembershipTierType.free &&
      !isPremiumEntitled(membership, entitlementOwner)
    ) {
      const freeTier = await this.prisma.membershipTier.findUnique({
        where: { type: MembershipTierType.free },
      });
      if (!freeTier) {
        throw new NotFoundException(
          i18nMessage("server.membership.freeTierNotFound"),
        );
      }
      effectiveTier = { ...freeTier };
    }

    const pendingIntent = await this.prisma.membershipPayment.findFirst({
      where: {
        membershipId: membership.id,
        status: PaymentStatus.pending,
        order: {
          status: OrderStatus.pending_payment,
          paymentExpiresAt: { gt: new Date() },
        },
      },
      include: { targetTier: true },
      orderBy: { createdAt: "desc" },
    });
    if (pendingIntent?.targetTier) {
      pendingTierName = pendingIntent.targetTier.name;
      pendingTierType = pendingIntent.targetTier.type;
      pendingPayment = true;
    }

    // Platform override'ı ÖNCE tier nesnesine uygulanır (getUserUsageStats bu
    // limitle sayar), DTO sonra eşlenir ve değerleri otomatik devralır.
    await this.applyListingLimitOverride(effectiveTier);
    const tierDto = this.mapTierToDto(effectiveTier);

    // Get usage stats (this will use the overridden maxFreeListings)
    const stats = await this.getUserUsageStats(userId, effectiveTier);

    return {
      id: membership.id,
      userId: membership.userId,
      tier: tierDto,
      status: membership.status,
      autoRenew: membership.autoRenew,
      currentPeriodStart: membership.currentPeriodStart,
      currentPeriodEnd: membership.currentPeriodEnd,
      cancelledAt: membership.cancelledAt || undefined,
      createdAt: membership.createdAt,
      // Ertelemeli downgrade: dönem sonunda geçilecek tier (null = yok). UI
      // "Üyeliğiniz {currentPeriodEnd} tarihinde {scheduledTierType} olacak" gösterebilir.
      ...(membership.scheduledTierType
        ? { scheduledTierType: membership.scheduledTierType }
        : {}),
      ...(membership.scheduledBillingPeriod
        ? { scheduledBillingPeriod: membership.scheduledBillingPeriod }
        : {}),
      ...(pendingPayment && pendingTierName
        ? { pendingTierName, pendingTierType, pendingPayment: true }
        : {}),
      ...stats,
    };
  }

  // ==========================================================================
  // HELPER METHODS
  // ==========================================================================
  private async getUserUsageStats(userId: string, tier: any) {
    // Count active listings
    const activeListings = await this.prisma.product.count({
      where: {
        sellerId: userId,
        status: {
          in: [
            ProductStatus.active,
            ProductStatus.pending,
            ProductStatus.reserved,
          ],
        },
      },
    });

    // Count featured listings (placeholder - would need featured flag on product)
    const featuredListings = 0;

    // Check platform setting for listing limit override based on tier type
    let maxFreeListings = tier.maxFreeListings;
    let maxTotalListings = tier.maxTotalListings;

    if (tier.type === MembershipTierType.free) {
      const freeListingLimitSetting =
        await this.prisma.platformSetting.findUnique({
          where: { settingKey: "free_listing_limit" },
        });
      if (freeListingLimitSetting?.settingValue) {
        const platformLimit = parseInt(
          freeListingLimitSetting.settingValue,
          10,
        );
        if (!isNaN(platformLimit) && platformLimit > 0) {
          maxFreeListings = platformLimit;
          maxTotalListings = platformLimit; // For free tier, total = free
        }
      }
    } else if (tier.type === MembershipTierType.premium) {
      const premiumListingLimitSetting =
        await this.prisma.platformSetting.findUnique({
          where: { settingKey: "premium_listing_limit" },
        });
      if (premiumListingLimitSetting?.settingValue) {
        const platformLimit = parseInt(
          premiumListingLimitSetting.settingValue,
          10,
        );
        if (!isNaN(platformLimit)) {
          if (platformLimit === -1) {
            maxTotalListings = -1; // Unlimited
          } else if (platformLimit > 0) {
            maxTotalListings = platformLimit;
          }
        }
      }
    } else if (tier.type === MembershipTierType.business) {
      const businessListingLimitSetting =
        await this.prisma.platformSetting.findUnique({
          where: { settingKey: "business_listing_limit" },
        });
      if (businessListingLimitSetting?.settingValue) {
        const platformLimit = parseInt(
          businessListingLimitSetting.settingValue,
          10,
        );
        if (!isNaN(platformLimit)) {
          if (platformLimit === -1) {
            maxTotalListings = -1; // Unlimited
          } else if (platformLimit > 0) {
            maxTotalListings = platformLimit;
          }
        }
      }
    }

    // Calculate remaining
    const usedFreeListings = Math.min(activeListings, maxFreeListings);
    const usedTotalListings = activeListings;
    const usedFeaturedSlots = featuredListings;

    return {
      usedFreeListings,
      usedTotalListings,
      usedFeaturedSlots,
      remainingFreeListings: Math.max(0, maxFreeListings - usedFreeListings),
      remainingTotalListings:
        maxTotalListings === -1
          ? -1 // Unlimited
          : Math.max(0, maxTotalListings - usedTotalListings),
      remainingFeaturedSlots: Math.max(
        0,
        tier.featuredListingSlots - usedFeaturedSlots,
      ),
    };
  }

  mapTierToDto(tier: any): MembershipTierResponseDto {
    return {
      id: tier.id,
      type: tier.type,
      name: tier.name,
      description: tier.description || undefined,
      monthlyPrice: parseFloat(tier.monthlyPrice),
      yearlyPrice: parseFloat(tier.yearlyPrice),
      maxFreeListings: tier.maxFreeListings,
      maxTotalListings: tier.maxTotalListings,
      maxImagesPerListing: tier.maxImagesPerListing,
      canCreateCollections: tier.canCreateCollections,
      canTrade: tier.canTrade,
      isAdFree: tier.isAdFree,
      featuredListingSlots: tier.featuredListingSlots,
      isActive: tier.isActive,
    };
  }
}
