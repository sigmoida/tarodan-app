import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma';
import {
  MembershipTierType,
  SubscriptionStatus,
  ProductStatus,
  OrderStatus,
  PaymentStatus,
} from '@prisma/client';
import {
  MembershipTierResponseDto,
  UserMembershipResponseDto,
} from './dto';
import { PaymentService } from '../payment/payment.service';
import { PaymentProvider } from '../payment/dto';

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
  // GET USER'S MEMBERSHIP
  // ==========================================================================
  async getUserMembership(userId: string): Promise<UserMembershipResponseDto> {
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
        throw new NotFoundException('Ücretsiz üyelik tipi bulunamadı');
      }

      const now = new Date();
      const oneYearLater = new Date(now.getFullYear() + 100, now.getMonth(), now.getDate()); // Free tier never expires

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

    // Ödeme beklerken (past_due) “satın alınmış” gibi gösterme: efektif planı ücretsiz yap
    let effectiveTier = membership.tier;
    let pendingTierName: string | undefined;
    let pendingTierType: string | undefined;
    let pendingPayment = false;
    if (membership.status === SubscriptionStatus.past_due) {
      // SELF-HEAL: past_due görünüyor ama ödeme aslında PayTR'de başarılı olmuş
      // olabilir (callback ngrok'a düşemediğinde sipariş pending kalır). Kullanıcı
      // sayfayı açtığı an, bu döneme ait BEKLEYEN PayTR ödemesini durum-sorgu ile
      // doğrula ve tamamla → reconciliation cron'unu beklemeden anında aktive olur.
      const virtualProductId = `membership-${membership.tierId}`;
      // 1dk tolerans: sipariş, abonelikten (currentPeriodStart) hemen sonra oluşur.
      const healFloor = new Date(membership.currentPeriodStart.getTime() - 60 * 1000);

      // (a) Bu döneme ait BEKLEYEN ödemeyi PayTR'ye sor; ödendiyse tamamla.
      const pendingPaymentRow = await this.prisma.payment.findFirst({
        where: {
          status: PaymentStatus.pending,
          provider: PaymentProvider.paytr,
          providerConversationId: { not: null },
          order: { buyerId: userId, productId: virtualProductId, createdAt: { gte: healFloor } },
        },
        orderBy: { createdAt: 'desc' },
        select: { id: true },
      });
      if (pendingPaymentRow) {
        try {
          await this.paymentService.verifyPaymentFromClient(pendingPaymentRow.id);
        } catch (err) {
          this.logger.warn(`Membership self-heal verify failed for payment ${pendingPaymentRow.id}: ${(err as Error)?.message}`);
        }
      }

      // (b) Tamamlanmış sipariş var mı (verify ya da cron'un işlediği) → aktive et.
      const paidOrder = await this.prisma.order.findFirst({
        where: {
          buyerId: userId,
          productId: virtualProductId,
          status: { in: [OrderStatus.completed, OrderStatus.delivered, OrderStatus.paid, OrderStatus.preparing] },
          createdAt: { gte: healFloor },
        },
        orderBy: { createdAt: 'desc' },
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
        this.logger.log(`Self-healed membership ${membership.id} past_due → active (paid order ${paidOrder.orderNumber})`);
      } else {
        const freeTier = await this.prisma.membershipTier.findUnique({
          where: { type: MembershipTierType.free },
        });
        if (freeTier) {
          effectiveTier = freeTier;
          pendingTierName = membership.tier.name;
          pendingTierType = membership.tier.type;
          pendingPayment = true;
        }
      }
    }

    // Map tier to DTO first
    const tierDto = this.mapTierToDto(effectiveTier);
    
    // Override listing limits based on tier type if platform setting exists
    // This must be done BEFORE getUserUsageStats so it uses the correct limit
    if (effectiveTier.type === MembershipTierType.free) {
      const freeListingLimitSetting = await this.prisma.platformSetting.findUnique({
        where: { settingKey: 'free_listing_limit' },
      });
      if (freeListingLimitSetting?.settingValue) {
        const platformLimit = parseInt(freeListingLimitSetting.settingValue, 10);
        if (!isNaN(platformLimit) && platformLimit > 0) {
          tierDto.maxFreeListings = platformLimit;
          tierDto.maxTotalListings = platformLimit; // For free tier, total = free
          // Also update the tier object so getUserUsageStats uses the correct value
          effectiveTier.maxFreeListings = platformLimit;
          effectiveTier.maxTotalListings = platformLimit;
        }
      }
    } else if (effectiveTier.type === MembershipTierType.basic) {
      const basicListingLimitSetting = await this.prisma.platformSetting.findUnique({
        where: { settingKey: 'basic_listing_limit' },
      });
      if (basicListingLimitSetting?.settingValue) {
        const platformLimit = parseInt(basicListingLimitSetting.settingValue, 10);
        if (!isNaN(platformLimit)) {
          if (platformLimit === -1) {
            tierDto.maxTotalListings = -1;
            effectiveTier.maxTotalListings = -1;
          } else if (platformLimit > 0) {
            tierDto.maxTotalListings = platformLimit;
            effectiveTier.maxTotalListings = platformLimit;
          }
        }
      }
    } else if (effectiveTier.type === MembershipTierType.premium) {
      const premiumListingLimitSetting = await this.prisma.platformSetting.findUnique({
        where: { settingKey: 'premium_listing_limit' },
      });
      if (premiumListingLimitSetting?.settingValue) {
        const platformLimit = parseInt(premiumListingLimitSetting.settingValue, 10);
        if (!isNaN(platformLimit)) {
          if (platformLimit === -1) {
            tierDto.maxTotalListings = -1; // Unlimited
            effectiveTier.maxTotalListings = -1;
          } else if (platformLimit > 0) {
            tierDto.maxTotalListings = platformLimit;
            effectiveTier.maxTotalListings = platformLimit;
          }
        }
      }
    } else if (effectiveTier.type === MembershipTierType.business) {
      const businessListingLimitSetting = await this.prisma.platformSetting.findUnique({
        where: { settingKey: 'business_listing_limit' },
      });
      if (businessListingLimitSetting?.settingValue) {
        const platformLimit = parseInt(businessListingLimitSetting.settingValue, 10);
        if (!isNaN(platformLimit)) {
          if (platformLimit === -1) {
            tierDto.maxTotalListings = -1; // Unlimited
            effectiveTier.maxTotalListings = -1;
          } else if (platformLimit > 0) {
            tierDto.maxTotalListings = platformLimit;
            effectiveTier.maxTotalListings = platformLimit;
          }
        }
      }
    }

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
      ...(pendingPayment && pendingTierName ? { pendingTierName, pendingTierType, pendingPayment: true } : {}),
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
        status: { in: [ProductStatus.active, ProductStatus.pending, ProductStatus.reserved] },
      },
    });

    // Count featured listings (placeholder - would need featured flag on product)
    const featuredListings = 0;

    // Check platform setting for listing limit override based on tier type
    let maxFreeListings = tier.maxFreeListings;
    let maxTotalListings = tier.maxTotalListings;
    
    if (tier.type === MembershipTierType.free) {
      const freeListingLimitSetting = await this.prisma.platformSetting.findUnique({
        where: { settingKey: 'free_listing_limit' },
      });
      if (freeListingLimitSetting?.settingValue) {
        const platformLimit = parseInt(freeListingLimitSetting.settingValue, 10);
        if (!isNaN(platformLimit) && platformLimit > 0) {
          maxFreeListings = platformLimit;
          maxTotalListings = platformLimit; // For free tier, total = free
        }
      }
    } else if (tier.type === MembershipTierType.premium) {
      const premiumListingLimitSetting = await this.prisma.platformSetting.findUnique({
        where: { settingKey: 'premium_listing_limit' },
      });
      if (premiumListingLimitSetting?.settingValue) {
        const platformLimit = parseInt(premiumListingLimitSetting.settingValue, 10);
        if (!isNaN(platformLimit)) {
          if (platformLimit === -1) {
            maxTotalListings = -1; // Unlimited
          } else if (platformLimit > 0) {
            maxTotalListings = platformLimit;
          }
        }
      }
    } else if (tier.type === MembershipTierType.business) {
      const businessListingLimitSetting = await this.prisma.platformSetting.findUnique({
        where: { settingKey: 'business_listing_limit' },
      });
      if (businessListingLimitSetting?.settingValue) {
        const platformLimit = parseInt(businessListingLimitSetting.settingValue, 10);
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
      remainingTotalListings: maxTotalListings === -1 
        ? -1 // Unlimited
        : Math.max(0, maxTotalListings - usedTotalListings),
      remainingFeaturedSlots: Math.max(0, tier.featuredListingSlots - usedFeaturedSlots),
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
      commissionDiscount: parseFloat(tier.commissionDiscount),
      isActive: tier.isActive,
    };
  }
}
