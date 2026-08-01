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

    // Vaat edilen limit = uygulanan limit: ikisi de doğrudan katman satırından
    // gelir (üyelik sayfası + checkout kartları bu ucu okur).
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

      // Limitler katman satırından gelir — tek kaynak MembershipTier.
      const maxFreeListings = membership.tier.maxFreeListings;
      const maxTotalListings = membership.tier.maxTotalListings;

      return {
        canCreateListing:
          membership.remainingTotalListings === -1 ||
          membership.remainingTotalListings > 0, // -1 means unlimited
        canUseFreeSlot: membership.remainingFreeListings > 0,
        canTrade: membership.tier.canTrade,
        canCreateCollection: membership.tier.canCreateCollections,
        isAdFree: membership.tier.isAdFree, // reklamsız avantajı (admin tier ayarı)
        maxImages: membership.tier.maxImagesPerListing,
        maxFreeListings,
        maxTotalListings,
        remainingFreeListings: membership.remainingFreeListings, // Already calculated correctly by getUserUsageStats
        remainingTotalListings: membership.remainingTotalListings, // Already calculated correctly by getUserUsageStats
        remainingFeaturedSlots: membership.remainingFeaturedSlots,
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
        // commissionDiscount BİLEREK yazılmıyor: komisyon avantajı yalnız
        // komisyon kurallarının üyelik ekseninden (PREMIUM/BUSINESS) gelir;
        // bu kolon motor tarafından hiç okunmaz (DB varsayılanı 0 kalır).
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

    if (!Object.values(dto).some((value) => value !== undefined)) {
      throw new BadRequestException("En az bir alan güncellenmelidir");
    }
    if (
      dto.maxTotalListings !== undefined &&
      dto.maxTotalListings !== -1 &&
      dto.maxTotalListings < 1
    ) {
      throw new BadRequestException(
        "Toplam ilan limiti -1 veya en az 1 olmalıdır",
      );
    }
    if (tier.type === MembershipTierType.free) {
      if (dto.isActive === false) {
        throw new BadRequestException(
          "Ücretsiz üyelik seviyesi pasif yapılamaz",
        );
      }
      if (
        (dto.monthlyPrice !== undefined && dto.monthlyPrice !== 0) ||
        (dto.yearlyPrice !== undefined && dto.yearlyPrice !== 0)
      ) {
        throw new BadRequestException(
          "Ücretsiz üyelik fiyatları sıfır olmalıdır",
        );
      }
    } else if (
      (dto.monthlyPrice !== undefined && dto.monthlyPrice <= 0) ||
      (dto.yearlyPrice !== undefined && dto.yearlyPrice <= 0)
    ) {
      throw new BadRequestException(
        "Ücretli üyelik fiyatları sıfırdan büyük olmalıdır",
      );
    }

    const updatedTier = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.membershipTier.update({
        where: { type: tierType },
        data: {
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
          isActive: dto.isActive,
          sortOrder: dto.sortOrder,
        },
      });

      if (
        tier.type !== MembershipTierType.free &&
        dto.monthlyPrice !== undefined
      ) {
        await tx.platformSetting.upsert({
          where: { settingKey: `${tier.type}_monthly_price` },
          update: { settingValue: String(dto.monthlyPrice) },
          create: {
            settingKey: `${tier.type}_monthly_price`,
            settingValue: String(dto.monthlyPrice),
            settingType: "number",
            description: `${tier.name} monthly membership price`,
          },
        });
      }

      return updated;
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
      bank: string | null;
      cardType: string | null;
      cardScheme: string | null;
      businessCard: boolean | null;
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
    const limits = await this.getUserLimits(userId);
    if (!limits.canTrade) {
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
