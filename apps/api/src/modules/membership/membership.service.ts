import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma';
import {
  MembershipTierType,
  SubscriptionStatus,
  ProductStatus,
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

@Injectable()
export class MembershipService {
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

    // Get usage stats
    const stats = await this.getUserUsageStats(userId, membership.tier);

    return {
      id: membership.id,
      userId: membership.userId,
      tier: this.mapTierToDto(membership.tier),
      status: membership.status,
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
    const membership = await this.getUserMembership(userId);

    return {
      canCreateListing: membership.remainingTotalListings > 0,
      canUseFreeSlot: membership.remainingFreeListings > 0,
      canTrade: membership.tier.canTrade,
      canCreateCollection: membership.tier.canCreateCollections,
      maxImages: membership.tier.maxImagesPerListing,
      maxFreeListings: membership.tier.maxFreeListings,
      maxTotalListings: membership.tier.maxTotalListings,
      remainingFreeListings: membership.remainingFreeListings,
      remainingTotalListings: membership.remainingTotalListings,
      remainingFeaturedSlots: membership.remainingFeaturedSlots,
      commissionDiscount: membership.tier.commissionDiscount,
      tierName: membership.tier.name,
      tierType: membership.tier.type,
    };
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

    // For paid tiers, create payment record and wait for payment
    // In real implementation, this would integrate with iyzico/PayTR
    // For now, we'll create membership in pending state

    if (existingMembership) {
      await this.prisma.userMembership.update({
        where: { userId },
        data: {
          tierId: tier.id,
          status: SubscriptionStatus.active, // In real app, this would be 'pending' until payment
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

    // Create payment record
    const membership = await this.prisma.userMembership.findUnique({
      where: { userId },
    });

    if (membership) {
      await this.prisma.membershipPayment.create({
        data: {
          membershipId: membership.id,
          amount: price,
          provider: 'pending',
          status: 'pending',
          periodStart: now,
          periodEnd: periodEnd,
        },
      });
    }

    return this.getUserMembership(userId);
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
        console.error(`Failed to downgrade membership ${membership.id}:`, error);
      }
    }

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

    // Calculate remaining
    const usedFreeListings = Math.min(activeListings, tier.maxFreeListings);
    const usedTotalListings = activeListings;
    const usedFeaturedSlots = featuredListings;

    return {
      usedFreeListings,
      usedTotalListings,
      usedFeaturedSlots,
      remainingFreeListings: Math.max(0, tier.maxFreeListings - usedFreeListings),
      remainingTotalListings: Math.max(0, tier.maxTotalListings - usedTotalListings),
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
