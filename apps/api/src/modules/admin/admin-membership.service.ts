import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../prisma";
import { AdminAuditService } from "./admin-audit.service";

/**
 * Üyelik seviyesi admin operasyonları (liste, güncelleme) —
 * AdminService'in MEMBERSHIP TIER MANAGEMENT bölümünden birebir taşındı.
 * AdminService aynı imzalarla buraya delege eder.
 */
@Injectable()
export class AdminMembershipService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AdminAuditService,
  ) {}

  // ==================== MEMBERSHIP TIER MANAGEMENT ====================

  /**
   * Get membership tiers
   */
  async getMembershipTiers() {
    const tiers = await this.prisma.membershipTier.findMany({
      include: {
        _count: {
          select: { userMemberships: true },
        },
      },
      orderBy: { sortOrder: "asc" },
    });

    return {
      data: tiers.map((t) => ({
        id: t.id,
        type: t.type,
        name: t.name,
        description: t.description,
        monthlyPrice: Number(t.monthlyPrice),
        yearlyPrice: Number(t.yearlyPrice),
        maxFreeListings: t.maxFreeListings,
        maxTotalListings: t.maxTotalListings,
        maxImagesPerListing: t.maxImagesPerListing,
        canCreateCollections: t.canCreateCollections,
        canTrade: t.canTrade,
        isAdFree: t.isAdFree,
        featuredListingSlots: t.featuredListingSlots,
        commissionDiscount: Number(t.commissionDiscount),
        isActive: t.isActive,
        sortOrder: t.sortOrder,
        userCount: t._count.userMemberships,
        createdAt: t.createdAt,
      })),
    };
  }

  /**
   * Update membership tier
   */
  async updateMembershipTier(
    adminId: string,
    tierId: string,
    dto: {
      name?: string;
      description?: string;
      monthlyPrice?: number;
      yearlyPrice?: number;
      maxFreeListings?: number;
      maxTotalListings?: number;
      maxImagesPerListing?: number;
      canCreateCollections?: boolean;
      canTrade?: boolean;
      isAdFree?: boolean;
      isActive?: boolean;
      sortOrder?: number;
    },
  ) {
    const tier = await this.prisma.membershipTier.findUnique({
      where: { id: tierId },
    });

    if (!tier) {
      throw new NotFoundException("Üyelik seviyesi bulunamadı");
    }

    const oldTier = { ...tier };

    const updatedTier = await this.prisma.membershipTier.update({
      where: { id: tierId },
      data: {
        name: dto.name,
        description: dto.description,
        monthlyPrice:
          dto.monthlyPrice !== undefined ? dto.monthlyPrice : undefined,
        yearlyPrice:
          dto.yearlyPrice !== undefined ? dto.yearlyPrice : undefined,
        maxFreeListings: dto.maxFreeListings,
        maxTotalListings: dto.maxTotalListings,
        maxImagesPerListing: dto.maxImagesPerListing,
        canCreateCollections: dto.canCreateCollections,
        canTrade: dto.canTrade,
        isAdFree: dto.isAdFree,
        // featuredListingSlots + commissionDiscount are no longer admin-editable
        // (dead entitlement / never applied); DB columns retained but left untouched.
        isActive: dto.isActive,
        sortOrder: dto.sortOrder,
      },
    });

    // Create audit log
    await this.audit.createAuditLog(
      adminId,
      "membership_tier_update",
      "MembershipTier",
      tierId,
      oldTier,
      updatedTier,
    );

    return updatedTier;
  }
}
