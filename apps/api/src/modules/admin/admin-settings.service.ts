import { BadRequestException, Injectable } from "@nestjs/common";
import { MembershipTierType } from "@prisma/client";
import { PrismaService } from "../../prisma";
import { AdminAuditService } from "./admin-audit.service";
import { UpdatePlatformSettingDto } from "./dto";

/**
 * Platform ayarları yönetimi — AdminService'in PLATFORM SETTINGS bölümünden
 * birebir taşındı. AdminService aynı imzalarla buraya delege eder.
 */
@Injectable()
export class AdminSettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AdminAuditService,
  ) {}

  /**
   * Get all platform settings
   */
  async getPlatformSettings() {
    return this.prisma.platformSetting.findMany({
      orderBy: { settingKey: "asc" },
    });
  }

  /**
   * Get public platform settings (listing limits, message settings, and membership prices)
   */
  async getPublicSettings() {
    const settings = await this.prisma.platformSetting.findMany({
      where: {
        settingKey: {
          in: [
            "free_listing_limit",
            "basic_listing_limit",
            "premium_listing_limit",
            "business_listing_limit",
            "max_message_length",
            "basic_monthly_price",
            "premium_monthly_price",
            "business_monthly_price",
            "yearly_discount_percentage",
          ],
        },
      },
    });

    const result: Record<string, number> = {};
    settings.forEach((setting) => {
      // For prices and percentages, use parseFloat; for limits, use parseInt
      const isPriceOrPercentage =
        setting.settingKey.includes("_price") ||
        setting.settingKey.includes("_percentage");
      const value = isPriceOrPercentage
        ? parseFloat(setting.settingValue)
        : parseInt(setting.settingValue, 10);
      if (!isNaN(value)) {
        result[setting.settingKey] = value;
      }
    });

    // Calculate yearly prices from monthly prices and discount
    const discountPercentage = result.yearly_discount_percentage ?? 20;
    if (result.basic_monthly_price) {
      result.basic_yearly_price =
        result.basic_monthly_price * 12 * (1 - discountPercentage / 100);
    }
    if (result.premium_monthly_price) {
      result.premium_yearly_price =
        result.premium_monthly_price * 12 * (1 - discountPercentage / 100);
    }
    if (result.business_monthly_price) {
      result.business_yearly_price =
        result.business_monthly_price * 12 * (1 - discountPercentage / 100);
    }

    return result;
  }

  /**
   * Update platform setting
   */
  async updatePlatformSetting(adminId: string, dto: UpdatePlatformSettingDto) {
    const existing = await this.prisma.platformSetting.findUnique({
      where: { settingKey: dto.key },
    });

    const priceTierByKey: Partial<Record<string, MembershipTierType>> = {
      basic_monthly_price: MembershipTierType.basic,
      premium_monthly_price: MembershipTierType.premium,
      business_monthly_price: MembershipTierType.business,
    };
    const priceTier = priceTierByKey[dto.key];
    const numericValue = Number(dto.value);
    if (
      priceTier &&
      (!Number.isFinite(numericValue) ||
        numericValue <= 0 ||
        numericValue > 1_000_000)
    ) {
      throw new BadRequestException(
        "Üyelik aylık fiyatı 0 ile 1.000.000 arasında olmalıdır",
      );
    }
    if (
      dto.key === "yearly_discount_percentage" &&
      (!Number.isFinite(numericValue) || numericValue < 0 || numericValue > 90)
    ) {
      throw new BadRequestException(
        "Yıllık indirim oranı 0 ile 90 arasında olmalıdır",
      );
    }

    const setting = await this.prisma.$transaction(async (tx) => {
      const updatedSetting = await tx.platformSetting.upsert({
        where: { settingKey: dto.key },
        update: {
          settingValue: dto.value,
          description: dto.description,
        },
        create: {
          settingKey: dto.key,
          settingValue: dto.value,
          settingType: dto.type || "string",
          description: dto.description,
        },
      });

      if (priceTier) {
        const discountSetting = await tx.platformSetting.findUnique({
          where: { settingKey: "yearly_discount_percentage" },
        });
        const parsedDiscount = Number(discountSetting?.settingValue ?? 20);
        const discount = Number.isFinite(parsedDiscount) ? parsedDiscount : 20;
        const yearlyPrice =
          Math.round(numericValue * 12 * (1 - discount / 100) * 100) / 100;
        await tx.membershipTier.update({
          where: { type: priceTier },
          data: { monthlyPrice: numericValue, yearlyPrice },
        });
      } else if (dto.key === "yearly_discount_percentage") {
        const paidTiers = await tx.membershipTier.findMany({
          where: { type: { not: MembershipTierType.free } },
          select: { id: true, monthlyPrice: true },
        });
        for (const tier of paidTiers) {
          const yearlyPrice =
            Math.round(
              Number(tier.monthlyPrice) * 12 * (1 - numericValue / 100) * 100,
            ) / 100;
          await tx.membershipTier.update({
            where: { id: tier.id },
            data: { yearlyPrice },
          });
        }
      }

      return updatedSetting;
    });

    // Get AdminUser ID from User ID
    const adminUser = await this.prisma.adminUser.findFirst({
      where: { userId: adminId, isActive: true },
      select: { id: true },
    });

    if (adminUser) {
      await this.audit.createAuditLog(
        adminUser.id,
        "setting_update",
        "PlatformSetting",
        setting.id,
        existing,
        setting,
      );
    }

    return setting;
  }
}
