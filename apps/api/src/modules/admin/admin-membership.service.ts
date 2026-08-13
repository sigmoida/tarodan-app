import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma";
import {
  MembershipTierUpdateInput,
  MembershipTierUpdateService,
} from "../membership/membership-tier-update.service";

/**
 * Üyelik seviyesi admin operasyonları (liste, güncelleme). Güncelleme,
 * membership modülündeki ORTAK çekirdeğe (MembershipTierUpdateService) delege
 * edilir: PATCH /membership/admin/tiers/:type rotasıyla kurallar, audit log ve
 * free-canTrade cache düşürme birebir aynıdır. AdminService aynı imzalarla
 * buraya delege eder.
 */
@Injectable()
export class AdminMembershipService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tierUpdate: MembershipTierUpdateService,
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
        isActive: t.isActive,
        sortOrder: t.sortOrder,
        userCount: t._count.userMemberships,
        createdAt: t.createdAt,
      })),
    };
  }

  /**
   * Update membership tier (delegate → MembershipTierUpdateService)
   */
  async updateMembershipTier(
    adminId: string,
    tierId: string,
    dto: MembershipTierUpdateInput,
  ) {
    return this.tierUpdate.updateTier(adminId, { id: tierId }, dto);
  }
}
