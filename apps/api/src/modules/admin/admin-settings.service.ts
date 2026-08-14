import { BadRequestException, Injectable } from "@nestjs/common";
import { MembershipTierType, SellerType } from "@prisma/client";
import { PrismaService } from "../../prisma";
import { AdminAuditService } from "./admin-audit.service";
import { UpdatePlatformSettingDto, UpdateWarehouseAddressDto } from "./dto";
import { i18nMessage } from "../i18n";

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
   * Get public platform settings (message settings and membership prices)
   */
  async getPublicSettings() {
    const settings = await this.prisma.platformSetting.findMany({
      where: {
        settingKey: {
          in: [
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
        i18nMessage("server.admin.membership.monthlyPriceRange"),
      );
    }
    if (
      dto.key === "yearly_discount_percentage" &&
      (!Number.isFinite(numericValue) || numericValue < 0 || numericValue > 90)
    ) {
      throw new BadRequestException(
        i18nMessage("server.admin.membership.yearlyDiscountRange"),
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

  /**
   * Get the safe-trade warehouse address referenced by the
   * `warehouse_address_id` platform setting (null when not configured yet).
   */
  async getWarehouseAddress() {
    const setting = await this.prisma.platformSetting.findUnique({
      where: { settingKey: "warehouse_address_id" },
    });
    if (!setting?.settingValue) return null;
    return this.prisma.address.findUnique({
      where: { id: setting.settingValue },
    });
  }

  /**
   * Create/update the warehouse address and point `warehouse_address_id` at it.
   * The address is owned by the platform seller account so it survives admin
   * staff turnover; trade escrow flows resolve it via the platform setting.
   */
  async updateWarehouseAddress(
    adminId: string,
    dto: UpdateWarehouseAddressDto,
  ) {
    const platformUser = await this.prisma.user.findFirst({
      where: { email: "platform@tarodan.com", sellerType: SellerType.platform },
      select: { id: true },
    });
    if (!platformUser) {
      throw new BadRequestException(
        i18nMessage("server.admin.platformSellerMissing"),
      );
    }

    const existingSetting = await this.prisma.platformSetting.findUnique({
      where: { settingKey: "warehouse_address_id" },
    });
    const existingAddress = existingSetting?.settingValue
      ? await this.prisma.address.findUnique({
          where: { id: existingSetting.settingValue },
        })
      : null;

    const addressData = {
      title: dto.title || "Tarodan Deposu",
      fullName: dto.fullName,
      phone: dto.phone,
      city: dto.city,
      district: dto.district,
      address: dto.address,
      zipCode: dto.zipCode || null,
    };

    const address = await this.prisma.$transaction(async (tx) => {
      const saved = existingAddress
        ? await tx.address.update({
            where: { id: existingAddress.id },
            data: addressData,
          })
        : await tx.address.create({
            data: {
              ...addressData,
              userId: platformUser.id,
              isDefault: false,
            },
          });

      await tx.platformSetting.upsert({
        where: { settingKey: "warehouse_address_id" },
        update: { settingValue: saved.id },
        create: {
          settingKey: "warehouse_address_id",
          settingValue: saved.id,
          settingType: "string",
          description:
            "Tarodan central warehouse address ID for safe-trade escrow",
        },
      });

      return saved;
    });

    const adminUser = await this.prisma.adminUser.findFirst({
      where: { userId: adminId, isActive: true },
      select: { id: true },
    });
    if (adminUser) {
      await this.audit.createAuditLog(
        adminUser.id,
        "warehouse_address_update",
        "Address",
        address.id,
        existingAddress,
        address,
      );
    }

    return address;
  }
}
