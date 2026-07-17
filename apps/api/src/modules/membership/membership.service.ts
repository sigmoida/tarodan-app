import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
  Logger,
} from "@nestjs/common";
import { PrismaService } from "../../prisma";
import { MembershipTierType } from "@prisma/client";
import {
  SubscribeDto,
  CreateMembershipTierDto,
  UpdateMembershipTierDto,
  MembershipTierResponseDto,
  UserMembershipResponseDto,
  MembershipLimitsDto,
} from "./dto";
import { PaymentProvider } from "../payment/dto";
import { Request } from "express";
import { MembershipPaymentInitResponseDto } from "./dto/membership-payment.dto";
import { isPremiumEntitled } from "./membership.util";
import { MembershipCommonService } from "./membership-common.service";
import { MembershipSubscriptionService } from "./membership-subscription.service";
import { i18nMessage } from "../i18n";

/**
 * MembershipService (facade) — her public imza aynen korunur. Tier/sorgu/limit/
 * tier-admin metotları burada; abonelik + PayTR + kayıtlı kart işleri
 * MembershipSubscriptionService'e (this.subscription.*) delege edilir. Paylaşılan
 * okuma/eşleme yardımcıları MembershipCommonService'te (this.common.*). Dış
 * çağıranlar (collection/trade-lifecycle/product/media.controller, scheduler,
 * controller) etkilenmez.
 */
@Injectable()
export class MembershipService {
  private readonly logger = new Logger(MembershipService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly common: MembershipCommonService,
    private readonly subscription: MembershipSubscriptionService,
  ) {}

  // ==========================================================================
  // GET ALL TIERS
  // ==========================================================================
  async getAllTiers(
    includeInactive = false,
  ): Promise<MembershipTierResponseDto[]> {
    const tiers = await this.prisma.membershipTier.findMany({
      where: includeInactive ? {} : { isActive: true },
      orderBy: { sortOrder: "asc" },
    });

    return tiers.map((tier) => this.common.mapTierToDto(tier));
  }

  // ==========================================================================
  // GET TIER BY TYPE
  // ==========================================================================
  async getTierByType(
    type: MembershipTierType,
  ): Promise<MembershipTierResponseDto> {
    const tier = await this.prisma.membershipTier.findUnique({
      where: { type },
    });

    if (!tier) {
      throw new NotFoundException(
        i18nMessage("server.membership.tierNotFound", { type }),
      );
    }

    return this.common.mapTierToDto(tier);
  }

  // ==========================================================================
  // GET USER'S MEMBERSHIP (delegate → MembershipCommonService)
  // ==========================================================================
  async getUserMembership(userId: string): Promise<UserMembershipResponseDto> {
    return this.common.getUserMembership(userId);
  }

  // ==========================================================================
  // GET USER'S MEMBERSHIP LIMITS (for checking permissions)
  // ==========================================================================
  async getUserLimits(userId: string): Promise<MembershipLimitsDto> {
    try {
      if (!userId) {
        throw new BadRequestException(
          i18nMessage("server.membership.userIdNotFound"),
        );
      }

      const membership = await this.getUserMembership(userId);

      if (!membership || !membership.tier) {
        throw new NotFoundException(
          i18nMessage("server.membership.infoNotFound"),
        );
      }

      // getUserUsageStats already handles platform setting override for all tiers
      // We just need to ensure maxFreeListings and maxTotalListings reflect the platform setting override
      let maxFreeListings = membership.tier.maxFreeListings;
      let maxTotalListings = membership.tier.maxTotalListings;

      if (membership.tier.type === MembershipTierType.free) {
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
      } else if (membership.tier.type === MembershipTierType.premium) {
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
      } else if (membership.tier.type === MembershipTierType.business) {
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

      return {
        canCreateListing:
          membership.remainingTotalListings === -1 ||
          membership.remainingTotalListings > 0, // -1 means unlimited
        canUseFreeSlot: membership.remainingFreeListings > 0,
        canTrade: membership.tier.canTrade,
        canCreateCollection: membership.tier.canCreateCollections,
        isAdFree: membership.tier.isAdFree, // reklamsız avantajı (admin tier ayarı)
        maxImages: membership.tier.maxImagesPerListing,
        maxFreeListings: maxFreeListings, // Use platform setting override for free tier
        maxTotalListings: maxTotalListings, // Use platform setting override for all tiers
        remainingFreeListings: membership.remainingFreeListings, // Already calculated correctly by getUserUsageStats
        remainingTotalListings: membership.remainingTotalListings, // Already calculated correctly by getUserUsageStats
        remainingFeaturedSlots: membership.remainingFeaturedSlots,
        commissionDiscount: membership.tier.commissionDiscount,
        tierName: membership.tier.name,
        tierType: membership.tier.type,
      };
    } catch (error) {
      this.logger.warn("getUserLimits failed");
      // Re-throw known exceptions
      if (
        error instanceof BadRequestException ||
        error instanceof NotFoundException ||
        error instanceof ForbiddenException
      ) {
        throw error;
      }
      // Wrap unknown errors — do not leak internal detail to the client.
      throw new BadRequestException(
        i18nMessage("server.membership.limitsFetchFailed"),
      );
    }
  }

  // ==========================================================================
  // SUBSCRIBE TO TIER (delegate → MembershipSubscriptionService)
  // ==========================================================================
  async subscribe(
    userId: string,
    dto: SubscribeDto,
  ): Promise<UserMembershipResponseDto> {
    return this.subscription.subscribe(userId, dto);
  }

  // ==========================================================================
  // INITIATE MEMBERSHIP PAYMENT (delegate → MembershipSubscriptionService)
  // ==========================================================================
  async initiateMembershipPayment(
    userId: string,
    provider: PaymentProvider,
    req?: Request,
  ): Promise<MembershipPaymentInitResponseDto> {
    return this.subscription.initiateMembershipPayment(userId, provider, req);
  }

  // ==========================================================================
  // CANCEL SUBSCRIPTION (delegate → MembershipSubscriptionService)
  // ==========================================================================
  async cancelSubscription(userId: string): Promise<UserMembershipResponseDto> {
    return this.subscription.cancelSubscription(userId);
  }

  // ==========================================================================
  // CANCEL SCHEDULED CHANGE (delegate → MembershipSubscriptionService)
  // ==========================================================================
  async cancelScheduledChange(
    userId: string,
  ): Promise<UserMembershipResponseDto> {
    return this.subscription.cancelScheduledChange(userId);
  }

  // ==========================================================================
  // AUTO-RENEW TOGGLE (delegate → MembershipSubscriptionService)
  // ==========================================================================
  async toggleAutoRenew(
    userId: string,
    autoRenew: boolean,
  ): Promise<UserMembershipResponseDto> {
    return this.subscription.toggleAutoRenew(userId, autoRenew);
  }

  // ==========================================================================
  // ADMIN: CREATE TIER
  // ==========================================================================
  async createTier(
    dto: CreateMembershipTierDto,
  ): Promise<MembershipTierResponseDto> {
    const existingTier = await this.prisma.membershipTier.findUnique({
      where: { type: dto.type },
    });

    if (existingTier) {
      throw new BadRequestException(
        i18nMessage("server.membership.tierAlreadyExists", { type: dto.type }),
      );
    }

    const tier = await this.prisma.membershipTier.create({
      data: {
        type: dto.type,
        name: dto.name,
        description: dto.description,
        monthlyPrice: dto.monthlyPrice,
        yearlyPrice: dto.yearlyPrice,
        maxFreeListings: dto.maxFreeListings,
        maxTotalListings: dto.maxTotalListings,
        maxImagesPerListing: dto.maxImagesPerListing,
        canCreateCollections: dto.canCreateCollections,
        canTrade: dto.canTrade,
        isAdFree: dto.isAdFree,
        featuredListingSlots: dto.featuredListingSlots,
        commissionDiscount: dto.commissionDiscount,
        isActive: true,
      },
    });

    return this.common.mapTierToDto(tier);
  }

  // ==========================================================================
  // ADMIN: UPDATE TIER
  // ==========================================================================
  async updateTier(
    tierType: MembershipTierType,
    dto: UpdateMembershipTierDto,
  ): Promise<MembershipTierResponseDto> {
    const tier = await this.prisma.membershipTier.findUnique({
      where: { type: tierType },
    });

    if (!tier) {
      throw new NotFoundException(
        i18nMessage("server.membership.tierNotFound", { type: tierType }),
      );
    }

    const updatedTier = await this.prisma.membershipTier.update({
      where: { type: tierType },
      data: dto,
    });

    return this.common.mapTierToDto(updatedTier);
  }

  // ==========================================================================
  // OTO-YENİLEME (MIT recurring) (delegate → MembershipSubscriptionService)
  // ==========================================================================
  async runAutoRenewals(): Promise<{
    renewed: number;
    failed: number;
    attempted: number;
  }> {
    return this.subscription.runAutoRenewals();
  }

  // ==========================================================================
  // SAVED CARDS (CAPI) — listele (delegate → MembershipSubscriptionService)
  // ==========================================================================
  async listSavedCards(userId: string): Promise<
    Array<{
      id: string;
      last4: string;
      brand: string | null;
      expMonth: string | null;
      expYear: string | null;
      requireCvv: boolean;
      isDefault: boolean;
      autoRenewEligible: boolean;
      createdAt: Date;
    }>
  > {
    return this.subscription.listSavedCards(userId);
  }

  // ==========================================================================
  // SAVED CARDS (CAPI) — sil (delegate → MembershipSubscriptionService)
  // ==========================================================================
  async deleteSavedCard(
    userId: string,
    cardId: string,
  ): Promise<{ deleted: boolean }> {
    return this.subscription.deleteSavedCard(userId, cardId);
  }

  // ==========================================================================
  // CHECK MEMBERSHIP EXPIRY (delegate → MembershipSubscriptionService)
  // ==========================================================================
  async checkExpiredMemberships(): Promise<number> {
    return this.subscription.checkExpiredMemberships();
  }

  // ==========================================================================
  // VALIDATE LISTING CREATION
  // ==========================================================================
  // #224: bu üç canCreate*() metodunun `reason` alanı i18nMessage()'a taşınmadı —
  // (a) trade/product/collection modüllerinde doğrudan `throw new
  // BadRequestException(result.reason)` ile veya `||` fallback'iyle string olarak
  // tüketiliyor (örn. trade-lifecycle.service.ts, collection-crud.service.ts —
  // kapsam dışı), (b) /membership/check/* endpoint'leri `reason`'ı olduğu gibi
  // JSON response'ta client'a dönüyor (AllExceptionsFilter'ın locale-render'ı yalnız
  // exception'larda çalışır, düz 200 body'de değil). Tipi payload'a çevirmek bu
  // modüllerde de değişiklik ister — kapsam dışı, invasive, rapora bkz.
  async canCreateListing(
    userId: string,
  ): Promise<{ allowed: boolean; reason?: string }> {
    const limits = await this.getUserLimits(userId);

    if (!limits.canCreateListing) {
      return {
        allowed: false,
        reason: "İlan limitinize ulaştınız. Üyeliğinizi yükseltin.",
      };
    }

    return { allowed: true };
  }

  // ==========================================================================
  // VALIDATE TRADE CREATION
  // ==========================================================================
  async canCreateTrade(
    userId: string,
  ): Promise<{ allowed: boolean; reason?: string }> {
    // Takas kapısı GERÇEK (satın alınan) tier'a bakar. getUserLimits, ödeme bekleyen (past_due)
    // paralı üyeliği "free"ye düşürdüğü için premium üye takası yanlışlıkla engelleniyordu (BUG A).
    // Bu yüzden ham üyeliği okuyup tier.canTrade'i kontrol ediyoruz; past_due (ödeme bekleyen)
    // paralı üye de takas yapabilir. Sadece free / iptal / süresi dolmuş engellenir.
    let membership = await this.prisma.userMembership.findUnique({
      where: { userId },
      include: { tier: true },
    });
    // Kayıt (register) userMembership satırı oluşturmaz; satır yalnızca
    // getUserMembership ilk çağrıldığında lazy oluşturulur. canCreateTrade ham satırı
    // okuduğu için, üyelik sayfasını hiç açmamış yeni free kullanıcı yanlışlıkla
    // engelleniyordu. Satırı (free tier) garanti edip ÖYLE kontrol et — past_due
    // premium hâlâ takas edebilsin diye sonra yine HAM tier/status okunur (BUG A).
    if (!membership) {
      await this.getUserMembership(userId); // free tier satırını lazy oluşturur
      membership = await this.prisma.userMembership.findUnique({
        where: { userId },
        include: { tier: true },
      });
    }
    // Premium hakkı tek doğruluk kaynağı isPremiumEntitled: ücretli tier + dönem
    // bitmemiş + durum∈{active,cancelled}. past_due (ödeme onaylanmamış) takas yapamaz;
    // ödeme onaylanınca status=active olur. tier.canTrade ayrıca tier yeteneğini doğrular.
    if (
      !membership ||
      !isPremiumEntitled(membership) ||
      !membership.tier?.canTrade
    ) {
      return {
        allowed: false,
        reason:
          "Takas özelliği üyeliğinizde mevcut değil. Üyeliğinizi yükseltin.",
      };
    }

    return { allowed: true };
  }

  // ==========================================================================
  // VALIDATE COLLECTION CREATION
  // ==========================================================================
  async canCreateCollection(
    userId: string,
  ): Promise<{ allowed: boolean; reason?: string }> {
    const limits = await this.getUserLimits(userId);

    if (!limits.canCreateCollection) {
      return {
        allowed: false,
        reason:
          "Koleksiyon özelliği üyeliğinizde mevcut değil. Üyeliğinizi yükseltin.",
      };
    }

    return { allowed: true };
  }
}
