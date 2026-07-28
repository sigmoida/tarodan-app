import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { MembershipTierType } from "@prisma/client";
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

    const oldTier = { ...tier };

    const updatedTier = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.membershipTier.update({
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

    // Create audit log
    await this.audit.createRequiredAuditLog(
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
