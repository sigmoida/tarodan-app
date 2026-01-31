import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../prisma';
import {
  MembershipTierType,
  SubscriptionStatus,
  ProductStatus,
  OrderStatus,
} from '@prisma/client';
import {
  SubscribeDto,
  CreateMembershipTierDto,
  UpdateMembershipTierDto,
  MembershipTierResponseDto,
  UserMembershipResponseDto,
  MembershipLimitsDto,
} from './dto';
import { PaymentService } from '../payment/payment.service';
import { PaymentProvider } from '../payment/dto';
import { Request } from 'express';
import { MembershipPaymentInitResponseDto } from './dto/membership-payment.dto';

@Injectable()
export class MembershipService {
  private readonly logger = new Logger(MembershipService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly paymentService: PaymentService,
  ) {}

  // ==========================================================================
  // GET ALL TIERS
  // ==========================================================================
  async getAllTiers(includeInactive = false): Promise<MembershipTierResponseDto[]> {
    const tiers = await this.prisma.membershipTier.findMany({
      where: includeInactive ? {} : { isActive: true },
      orderBy: { sortOrder: 'asc' },
    });

    return tiers.map((tier) => this.mapTierToDto(tier));
  }

  // ==========================================================================
  // GET TIER BY TYPE
  // ==========================================================================
  async getTierByType(type: MembershipTierType): Promise<MembershipTierResponseDto> {
    const tier = await this.prisma.membershipTier.findUnique({
      where: { type },
    });

    if (!tier) {
      throw new NotFoundException(`Üyelik tipi bulunamadı: ${type}`);
    }

    return this.mapTierToDto(tier);
  }

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

    // Map tier to DTO first
    let tierDto = this.mapTierToDto(membership.tier);
    
    // Override listing limits based on tier type if platform setting exists
    // This must be done BEFORE getUserUsageStats so it uses the correct limit
    if (membership.tier.type === MembershipTierType.free) {
      const freeListingLimitSetting = await this.prisma.platformSetting.findUnique({
        where: { settingKey: 'free_listing_limit' },
      });
      if (freeListingLimitSetting?.settingValue) {
        const platformLimit = parseInt(freeListingLimitSetting.settingValue, 10);
        if (!isNaN(platformLimit) && platformLimit > 0) {
          tierDto.maxFreeListings = platformLimit;
          tierDto.maxTotalListings = platformLimit; // For free tier, total = free
          // Also update the tier object so getUserUsageStats uses the correct value
          membership.tier.maxFreeListings = platformLimit;
          membership.tier.maxTotalListings = platformLimit;
        }
      }
    } else if (membership.tier.type === MembershipTierType.premium) {
      const premiumListingLimitSetting = await this.prisma.platformSetting.findUnique({
        where: { settingKey: 'premium_listing_limit' },
      });
      if (premiumListingLimitSetting?.settingValue) {
        const platformLimit = parseInt(premiumListingLimitSetting.settingValue, 10);
        if (!isNaN(platformLimit)) {
          if (platformLimit === -1) {
            tierDto.maxTotalListings = -1; // Unlimited
            membership.tier.maxTotalListings = -1;
          } else if (platformLimit > 0) {
            tierDto.maxTotalListings = platformLimit;
            membership.tier.maxTotalListings = platformLimit;
          }
        }
      }
    } else if (membership.tier.type === MembershipTierType.business) {
      const businessListingLimitSetting = await this.prisma.platformSetting.findUnique({
        where: { settingKey: 'business_listing_limit' },
      });
      if (businessListingLimitSetting?.settingValue) {
        const platformLimit = parseInt(businessListingLimitSetting.settingValue, 10);
        if (!isNaN(platformLimit)) {
          if (platformLimit === -1) {
            tierDto.maxTotalListings = -1; // Unlimited
            membership.tier.maxTotalListings = -1;
          } else if (platformLimit > 0) {
            tierDto.maxTotalListings = platformLimit;
            membership.tier.maxTotalListings = platformLimit;
          }
        }
      }
    }

    // Get usage stats (this will use the overridden maxFreeListings)
    const stats = await this.getUserUsageStats(userId, membership.tier);

    return {
      id: membership.id,
      userId: membership.userId,
      tier: tierDto,
      status: membership.status,
      autoRenew: membership.autoRenew,
      paymentMethodId: membership.paymentMethodId || undefined,
      currentPeriodStart: membership.currentPeriodStart,
      currentPeriodEnd: membership.currentPeriodEnd,
      cancelledAt: membership.cancelledAt || undefined,
      createdAt: membership.createdAt,
      ...stats,
    };
  }

  // ==========================================================================
  // GET USER'S MEMBERSHIP LIMITS (for checking permissions)
  // ==========================================================================
  async getUserLimits(userId: string): Promise<MembershipLimitsDto> {
    try {
      if (!userId) {
        throw new BadRequestException('Kullanıcı kimliği bulunamadı');
      }

      const membership = await this.getUserMembership(userId);

      if (!membership || !membership.tier) {
        throw new NotFoundException('Üyelik bilgisi bulunamadı');
      }

      // getUserUsageStats already handles platform setting override for all tiers
      // We just need to ensure maxFreeListings and maxTotalListings reflect the platform setting override
      let maxFreeListings = membership.tier.maxFreeListings;
      let maxTotalListings = membership.tier.maxTotalListings;
      
      if (membership.tier.type === MembershipTierType.free) {
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
      } else if (membership.tier.type === MembershipTierType.premium) {
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
      } else if (membership.tier.type === MembershipTierType.business) {
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

      return {
        canCreateListing: membership.remainingTotalListings === -1 || membership.remainingTotalListings > 0, // -1 means unlimited
        canUseFreeSlot: membership.remainingFreeListings > 0,
        canTrade: membership.tier.canTrade,
        canCreateCollection: membership.tier.canCreateCollections,
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
      this.logger.warn('getUserLimits failed');
      // Re-throw known exceptions
      if (error instanceof BadRequestException || error instanceof NotFoundException || error instanceof ForbiddenException) {
        throw error;
      }
      // Wrap unknown errors
      throw new BadRequestException(`Üyelik limitleri alınamadı: ${error instanceof Error ? error.message : 'Bilinmeyen hata'}`);
    }
  }

  // ==========================================================================
  // SUBSCRIBE TO TIER
  // ==========================================================================
  async subscribe(userId: string, dto: SubscribeDto): Promise<UserMembershipResponseDto> {
    const tier = await this.prisma.membershipTier.findUnique({
      where: { type: dto.tierType },
    });

    if (!tier) {
      throw new NotFoundException(`Üyelik tipi bulunamadı: ${dto.tierType}`);
    }

    if (!tier.isActive) {
      throw new BadRequestException('Bu üyelik tipi aktif değil');
    }

    // Check if user already has this tier
    const existingMembership = await this.prisma.userMembership.findUnique({
      where: { userId },
      include: { tier: true },
    });

    if (existingMembership?.tier.type === dto.tierType) {
      throw new BadRequestException('Zaten bu üyelik tipine sahipsiniz');
    }

    // Calculate period
    const now = new Date();
    const periodEnd = new Date(now);
    if (dto.billingPeriod === 'monthly') {
      periodEnd.setMonth(periodEnd.getMonth() + 1);
    } else {
      periodEnd.setFullYear(periodEnd.getFullYear() + 1);
    }

    const price = dto.billingPeriod === 'monthly' ? tier.monthlyPrice : tier.yearlyPrice;

    // For free tier, just update
    if (dto.tierType === MembershipTierType.free || price.toNumber() === 0) {
      if (existingMembership) {
        await this.prisma.userMembership.update({
          where: { userId },
          data: {
            tierId: tier.id,
            status: SubscriptionStatus.active,
            currentPeriodStart: now,
            currentPeriodEnd: periodEnd,
            cancelledAt: null,
          },
        });
      } else {
        await this.prisma.userMembership.create({
          data: {
            userId,
            tierId: tier.id,
            status: SubscriptionStatus.active,
            currentPeriodStart: now,
            currentPeriodEnd: periodEnd,
          },
        });
      }

      return this.getUserMembership(userId);
    }

    // For paid tiers, create membership in pending state and initiate payment
    let membership;
    if (existingMembership) {
      membership = await this.prisma.userMembership.update({
        where: { userId },
        data: {
          tierId: tier.id,
          status: SubscriptionStatus.past_due, // Will be activated after payment
          currentPeriodStart: now,
          currentPeriodEnd: periodEnd,
          cancelledAt: null,
        },
      });
    } else {
      membership = await this.prisma.userMembership.create({
        data: {
          userId,
          tierId: tier.id,
          status: SubscriptionStatus.past_due, // Will be activated after payment
          currentPeriodStart: now,
          currentPeriodEnd: periodEnd,
        },
      });
    }

    // Initiate payment with Iyzico (default provider)
    // This will create an order and payment, then return payment URL
    try {
      const paymentResult = await this.initiateMembershipPayment(
        userId,
        PaymentProvider.iyzico, // Default to Iyzico
        undefined, // No request object needed here
      );

      // Return membership info with payment URL
      return {
        ...(await this.getUserMembership(userId)),
        paymentUrl: paymentResult.paymentUrl,
        paymentId: paymentResult.paymentId,
        provider: paymentResult.provider,
      } as any;
    } catch (error) {
      // If payment initiation fails, rollback membership
      await this.prisma.userMembership.delete({
        where: { userId },
      }).catch(() => {
        // Ignore if already deleted or doesn't exist
      });
      throw error;
    }
  }

  // ==========================================================================
  // INITIATE MEMBERSHIP PAYMENT
  // ==========================================================================
  async initiateMembershipPayment(
    userId: string,
    provider: PaymentProvider,
    req?: Request,
  ): Promise<MembershipPaymentInitResponseDto> {
    const membership = await this.prisma.userMembership.findUnique({
      where: { userId },
      include: { tier: true },
    });

    if (!membership) {
      throw new NotFoundException('Üyelik bulunamadı');
    }

    if (membership.tier.type === MembershipTierType.free) {
      throw new BadRequestException('Ücretsiz üyelik için ödeme gerekmez');
    }

    // Determine billing period from membership period (monthly or yearly)
    const periodDays = Math.round(
      (membership.currentPeriodEnd.getTime() - membership.currentPeriodStart.getTime()) / (1000 * 60 * 60 * 24)
    );
    const isYearly = periodDays > 180; // More than 6 months = yearly
    
    const price = isYearly 
      ? membership.tier.yearlyPrice.toNumber() 
      : membership.tier.monthlyPrice.toNumber();

    if (price === 0) {
      throw new BadRequestException('Bu üyelik seviyesi için ödeme gerekmez');
    }

    // Find platform seller for membership orders
    const platformSeller = await this.prisma.user.findFirst({
      where: {
        email: 'platform@tarodan.com',
        sellerType: 'platform',
      },
    });

    if (!platformSeller) {
      throw new NotFoundException('Platform seller bulunamadı');
    }

    // Find or create a virtual product for membership
    // Use a category - we'll need to find a default category
    const defaultCategory = await this.prisma.category.findFirst({
      where: { isActive: true },
    });

    if (!defaultCategory) {
      throw new NotFoundException('Kategori bulunamadı');
    }

    // Create or find virtual product for membership
    const virtualProductId = `membership-${membership.tierId}`;
    let product = await this.prisma.product.findUnique({
      where: { id: virtualProductId },
    });

    if (!product) {
      product = await this.prisma.product.create({
        data: {
          id: virtualProductId,
          sellerId: platformSeller.id,
          categoryId: defaultCategory.id,
          title: `${membership.tier.name} Üyelik`,
          description: `Üyelik ödemesi için sanal ürün`,
          price: price,
          condition: 'new',
          status: ProductStatus.active,
        },
      });
    }

    // Generate order number
    const orderNumber = `MEM-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;

    // Create order for membership payment
    const order = await this.prisma.order.create({
      data: {
        orderNumber,
        buyerId: userId,
        sellerId: platformSeller.id,
        productId: product.id,
        totalAmount: price,
        commissionAmount: 0, // No commission for membership
        shippingCost: 0,
        status: OrderStatus.pending_payment,
        shippingAddress: {
          type: 'membership',
        } as any,
      },
    });

    // Initiate payment with the created order
    const paymentResult = await this.paymentService.initiatePayment(
      userId,
      {
        orderId: order.id,
        provider,
      },
      req,
    );

    return {
      paymentId: paymentResult.paymentId,
      membershipPaymentId: membership.id,
      paymentUrl: paymentResult.paymentUrl || '',
      paymentHtml: paymentResult.paymentHtml,
      provider: paymentResult.provider,
      expiresIn: paymentResult.expiresIn || 300,
    };
  }

  // ==========================================================================
  // CANCEL SUBSCRIPTION
  // ==========================================================================
  async cancelSubscription(userId: string): Promise<UserMembershipResponseDto> {
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

    await this.prisma.userMembership.update({
      where: { userId },
      data: {
        status: SubscriptionStatus.cancelled,
        cancelledAt: new Date(),
      },
    });

    return this.getUserMembership(userId);
  }

  // ==========================================================================
  // AUTO-RENEW TOGGLE
  // ==========================================================================
  async toggleAutoRenew(
    userId: string,
    autoRenew: boolean,
    paymentMethodId?: string,
  ): Promise<UserMembershipResponseDto> {
    const membership = await this.prisma.userMembership.findUnique({
      where: { userId },
      include: { tier: true },
    });

    if (!membership) {
      throw new NotFoundException('Üyelik bulunamadı');
    }

    // If enabling auto-renew, require a payment method
    if (autoRenew && !paymentMethodId) {
      // Check if user has any payment method
      const existingMethod = await this.prisma.paymentMethod.findFirst({
        where: { userId, isDefault: true },
      });
      
      if (!existingMethod) {
        throw new BadRequestException('Otomatik yenileme için kayıtlı bir kart gereklidir');
      }
      paymentMethodId = existingMethod.id;
    }

    // Validate payment method belongs to user
    if (paymentMethodId) {
      const paymentMethod = await this.prisma.paymentMethod.findFirst({
        where: { id: paymentMethodId, userId },
      });
      
      if (!paymentMethod) {
        throw new BadRequestException('Geçersiz ödeme yöntemi');
      }
    }

    await this.prisma.userMembership.update({
      where: { userId },
      data: {
        autoRenew,
        paymentMethodId: autoRenew ? paymentMethodId : null,
      },
    });

    return this.getUserMembership(userId);
  }

  // ==========================================================================
  // ADMIN: CREATE TIER
  // ==========================================================================
  async createTier(dto: CreateMembershipTierDto): Promise<MembershipTierResponseDto> {
    const existingTier = await this.prisma.membershipTier.findUnique({
      where: { type: dto.type },
    });

    if (existingTier) {
      throw new BadRequestException(`Üyelik tipi zaten mevcut: ${dto.type}`);
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

    return this.mapTierToDto(tier);
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
      throw new NotFoundException(`Üyelik tipi bulunamadı: ${tierType}`);
    }

    const updatedTier = await this.prisma.membershipTier.update({
      where: { type: tierType },
      data: dto,
    });

    return this.mapTierToDto(updatedTier);
  }

  // ==========================================================================
  // CHECK MEMBERSHIP EXPIRY (Scheduled job)
  // ==========================================================================
  async checkExpiredMemberships(): Promise<number> {
    const now = new Date();

    // Find expired memberships
    const expiredMemberships = await this.prisma.userMembership.findMany({
      where: {
        status: SubscriptionStatus.active,
        currentPeriodEnd: { lt: now },
        tier: { type: { not: MembershipTierType.free } },
      },
    });

    // Downgrade to free tier
    const freeTier = await this.prisma.membershipTier.findUnique({
      where: { type: MembershipTierType.free },
    });

    if (!freeTier) return 0;

    let downgradeCount = 0;

    for (const membership of expiredMemberships) {
      try {
        await this.prisma.userMembership.update({
          where: { id: membership.id },
          data: {
            tierId: freeTier.id,
            status: SubscriptionStatus.expired,
          },
        });
        downgradeCount++;
      } catch (error) {
        this.logger.warn('Failed to downgrade membership');

    return downgradeCount;
  }

  // ==========================================================================
  // VALIDATE LISTING CREATION
  // ==========================================================================
  async canCreateListing(userId: string): Promise<{ allowed: boolean; reason?: string }> {
    const limits = await this.getUserLimits(userId);

    if (!limits.canCreateListing) {
      return {
        allowed: false,
        reason: 'İlan limitinize ulaştınız. Üyeliğinizi yükseltin.',
      };
    }

    return { allowed: true };
  }

  // ==========================================================================
  // VALIDATE TRADE CREATION
  // ==========================================================================
  async canCreateTrade(userId: string): Promise<{ allowed: boolean; reason?: string }> {
    const limits = await this.getUserLimits(userId);

    if (!limits.canTrade) {
      return {
        allowed: false,
        reason: 'Takas özelliği üyeliğinizde mevcut değil. Üyeliğinizi yükseltin.',
      };
    }

    return { allowed: true };
  }

  // ==========================================================================
  // VALIDATE COLLECTION CREATION
  // ==========================================================================
  async canCreateCollection(userId: string): Promise<{ allowed: boolean; reason?: string }> {
    const limits = await this.getUserLimits(userId);

    if (!limits.canCreateCollection) {
      return {
        allowed: false,
        reason: 'Koleksiyon özelliği üyeliğinizde mevcut değil. Üyeliğinizi yükseltin.',
      };
    }

    return { allowed: true };
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

  private mapTierToDto(tier: any): MembershipTierResponseDto {
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
