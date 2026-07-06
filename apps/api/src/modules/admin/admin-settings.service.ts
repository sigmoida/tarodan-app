import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma';
import { AdminAuditService } from './admin-audit.service';
import { UpdatePlatformSettingDto } from './dto';

/**
 * Platform ayarları yönetimi — AdminService'in PLATFORM SETTINGS bölümünden
 * birebir taşındı. AdminService aynı imzalarla buraya delege eder.
 */
@Injectable()
export class AdminSettingsService {
  private readonly logger = new Logger(AdminSettingsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AdminAuditService,
  ) {}

  /**
   * Get all platform settings
   */
  async getPlatformSettings() {
    return this.prisma.platformSetting.findMany({
      orderBy: { settingKey: 'asc' },
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
            'free_listing_limit',
            'basic_listing_limit',
            'premium_listing_limit',
            'business_listing_limit',
            'max_message_length',
            'basic_monthly_price',
            'premium_monthly_price',
            'business_monthly_price',
            'yearly_discount_percentage',
          ],
        },
      },
    });

    const result: Record<string, number> = {};
    settings.forEach((setting) => {
      // For prices and percentages, use parseFloat; for limits, use parseInt
      const isPriceOrPercentage = setting.settingKey.includes('_price') || setting.settingKey.includes('_percentage');
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
      result.basic_yearly_price = result.basic_monthly_price * 12 * (1 - discountPercentage / 100);
    }
    if (result.premium_monthly_price) {
      result.premium_yearly_price = result.premium_monthly_price * 12 * (1 - discountPercentage / 100);
    }
    if (result.business_monthly_price) {
      result.business_yearly_price = result.business_monthly_price * 12 * (1 - discountPercentage / 100);
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

    const setting = await this.prisma.platformSetting.upsert({
      where: { settingKey: dto.key },
      update: {
        settingValue: dto.value,
        description: dto.description,
      },
      create: {
        settingKey: dto.key,
        settingValue: dto.value,
        settingType: dto.type || 'string',
        description: dto.description,
      },
    });

    // If this is a membership price setting, also update the MembershipTier
    if (dto.key === 'basic_monthly_price' || dto.key === 'premium_monthly_price' || dto.key === 'business_monthly_price' ||
      dto.key === 'yearly_discount_percentage') {
      try {
        // Get discount percentage
        const discountSetting = await this.prisma.platformSetting.findUnique({
          where: { settingKey: 'yearly_discount_percentage' },
        });
        const discountPercentage = discountSetting
          ? parseFloat(discountSetting.settingValue)
          : (dto.key === 'yearly_discount_percentage' ? parseFloat(dto.value) : 20);
        const finalDiscount = isNaN(discountPercentage) ? 20 : discountPercentage;

        if (dto.key === 'basic_monthly_price' || dto.key === 'yearly_discount_percentage') {
          // Update basic tier
          const basicTier = await this.prisma.membershipTier.findUnique({
            where: { type: 'basic' },
          });
          const basicMonthlySetting = await this.prisma.platformSetting.findUnique({
            where: { settingKey: 'basic_monthly_price' },
          });
          // Aylık fiyat ayarı yoksa (PlatformSetting satırı seed'lenmemiş olabilir),
          // tier'ın kayıtlı aylık fiyatına düş — böylece yalnız indirim değişse bile
          // yıllık fiyat yeniden hesaplanır (eskiden ayar yoksa tier atlanıyor, yıllık
          // eski indirimde takılı kalıyordu).
          const basicMonthly = basicMonthlySetting
            ? parseFloat(basicMonthlySetting.settingValue)
            : (dto.key === 'basic_monthly_price'
              ? parseFloat(dto.value)
              : (basicTier ? Number(basicTier.monthlyPrice) : null));

          if (basicTier && basicMonthly !== null && !isNaN(basicMonthly)) {
            // 2 ondalığa yuvarla (admin computedYearly ile birebir; 419,916 gibi artığı önler).
            const basicYearly = Math.round(basicMonthly * 12 * (1 - finalDiscount / 100) * 100) / 100;
            await this.prisma.membershipTier.update({
              where: { id: basicTier.id },
              data: {
                monthlyPrice: basicMonthly,
                yearlyPrice: basicYearly,
              },
            });
            this.logger.log(`Updated basic tier: monthly=${basicMonthly}, yearly=${basicYearly} (${finalDiscount}% discount)`);
          }
        }

        if (dto.key === 'premium_monthly_price' || dto.key === 'yearly_discount_percentage') {
          // Update premium tier
          const premiumTier = await this.prisma.membershipTier.findUnique({
            where: { type: 'premium' },
          });
          const premiumMonthlySetting = await this.prisma.platformSetting.findUnique({
            where: { settingKey: 'premium_monthly_price' },
          });
          // Aylık fiyat ayarı yoksa tier'ın kayıtlı aylık fiyatına düş (bkz. basic).
          const premiumMonthly = premiumMonthlySetting
            ? parseFloat(premiumMonthlySetting.settingValue)
            : (dto.key === 'premium_monthly_price'
              ? parseFloat(dto.value)
              : (premiumTier ? Number(premiumTier.monthlyPrice) : null));

          if (premiumTier && premiumMonthly !== null && !isNaN(premiumMonthly)) {
            // 2 ondalığa yuvarla (admin computedYearly ile birebir; 839,916 gibi artığı önler).
            const premiumYearly = Math.round(premiumMonthly * 12 * (1 - finalDiscount / 100) * 100) / 100;
            await this.prisma.membershipTier.update({
              where: { id: premiumTier.id },
              data: {
                monthlyPrice: premiumMonthly,
                yearlyPrice: premiumYearly,
              },
            });
            this.logger.log(`Updated premium tier: monthly=${premiumMonthly}, yearly=${premiumYearly} (${finalDiscount}% discount)`);
          }
        }

        if (dto.key === 'business_monthly_price' || dto.key === 'yearly_discount_percentage') {
          // Update business tier
          const businessTier = await this.prisma.membershipTier.findUnique({
            where: { type: 'business' },
          });
          const businessMonthlySetting = await this.prisma.platformSetting.findUnique({
            where: { settingKey: 'business_monthly_price' },
          });
          // Aylık fiyat ayarı yoksa tier'ın kayıtlı aylık fiyatına düş (bkz. basic).
          const businessMonthly = businessMonthlySetting
            ? parseFloat(businessMonthlySetting.settingValue)
            : (dto.key === 'business_monthly_price'
              ? parseFloat(dto.value)
              : (businessTier ? Number(businessTier.monthlyPrice) : null));

          if (businessTier && businessMonthly !== null && !isNaN(businessMonthly)) {
            // 2 ondalığa yuvarla (admin computedYearly ile birebir; 2.099,916 gibi artığı önler).
            const businessYearly = Math.round(businessMonthly * 12 * (1 - finalDiscount / 100) * 100) / 100;
            await this.prisma.membershipTier.update({
              where: { id: businessTier.id },
              data: {
                monthlyPrice: businessMonthly,
                yearlyPrice: businessYearly,
              },
            });
            this.logger.log(`Updated business tier: monthly=${businessMonthly}, yearly=${businessYearly} (${finalDiscount}% discount)`);
          }
        }
      } catch (error) {
        this.logger.error(`Failed to update membership tier price for ${dto.key}:`, error);
        // Don't throw - platform setting update succeeded, tier update is secondary
      }
    }

    // Get AdminUser ID from User ID
    const adminUser = await this.prisma.adminUser.findFirst({
      where: { userId: adminId, isActive: true },
      select: { id: true },
    });

    if (adminUser) {
      await this.audit.createAuditLog(adminUser.id, 'setting_update', 'PlatformSetting', setting.id, existing, setting);
    }

    return setting;
  }
}
