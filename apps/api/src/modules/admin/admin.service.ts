import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Optional,
  Logger,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../prisma';
import { StorageService } from '../storage/storage.service';
import { ModerationAiClient } from '../moderation/moderation-ai.client';
import {
  fulltextUserSearch,
  fulltextProductRatingSearch,
  fulltextUserDisplayNameSearch,
  fulltextCollectionSearch,
  fulltextTagSearch,
  fulltextAttributeGroupSearch,
  fulltextAttributeSearch,
  fulltextPaymentSearch,
  fulltextOrderSearch,
  fulltextDiscountSearch,
  fulltextShippingMethodSearch,
  fulltextShippingCarrierSearch,
  fulltextShippingZoneSearch,
  fulltextErrorLogSearch,
  fulltextSecurityLogSearch,
  fulltextEmailLogSearch,
} from '../../common/helpers/fulltext-search';
import { fulltextProductSearch } from '../product/helpers/fulltext-search';
import {
  CreateCommissionRuleDto,
  UpdateCommissionRuleDto,
  UpdatePlatformSettingDto,
  AdminUserQueryDto,
  AdminProductQueryDto,
  AdminOrderQueryDto,
  AuditLogQueryDto,
  ApproveProductDto,
  RejectProductDto,
  BanUserDto,
  AssignAdminStaffDto,
  UpdateAdminStaffDto,
  UpdateStaffSettingsDto,
  ResolveDisputeDto,
  AnalyticsQueryDto,
  AnalyticsGroupBy,
  UpdateOrderStatusDto,
  ReportQueryDto,
  AdminPaymentQueryDto,
  PaymentStatisticsQueryDto,
  PayoutTransactionsQueryDto,
  PayoutExportQueryDto,
  CreateStaticPageDto,
  UpdateStaticPageDto,
  UpdateEmailTemplateDto,
  UpdateProductDto,
  RatingQueryDto,
  UpdateRatingStatusDto,
  ReplyToRatingDto,
  RatingStatus,
  ApproveWarehouseTradeDto,
  RejectWarehouseTradeDto,
} from './dto';
import { ProductStatus, OrderStatus, Prisma, PaymentStatus, PaymentHoldStatus, OfferStatus, TradeStatus, ShipmentStatus, MessageStatus, TicketStatus, TicketPriority, TicketCategory, Brand, AdminRole } from '@prisma/client';
import { safeDecrementReserved } from '../product/helpers/product-availability.helper';
import { getProductStatusFromQuantity } from '../product/helpers/product-status.helper';
import { PaymentService } from '../payment/payment.service';
import { MessagingService } from '../messaging/messaging.service';
import { SupportService } from '../support/support.service';
import { SearchService } from '../search/search.service';
import { CacheService } from '../cache/cache.service';
import { DiscountService } from '../discount/discount.service';
import { EventService } from '../events/event.service';
import { RatingService } from '../rating/rating.service';
import { RefundService } from '../refund/refund.service';
import { NotificationService } from '../notification/notification.service';
import { NotificationType } from '../notification/dto/notification.dto';
import { SuratCargoService } from '../surat-cargo/surat-cargo.service';
import { normalizeSuratPhone, normalizeSuratLocation } from '../surat-cargo/surat-address.util';
import { OrderService } from '../order/order.service';
import {
  SuratKargoTuru,
  SuratOdemeTipi,
  SuratTasimaSekli,
  SuratTeslimSekli,
  SuratGonderiSekli,
} from '../surat-cargo/surat-cargo.types';

@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly paymentService: PaymentService,
    private readonly messagingService: MessagingService,
    private readonly supportService: SupportService,
    private readonly searchService: SearchService,
    private readonly cache: CacheService,
    private readonly discountService: DiscountService,
    private readonly eventService: EventService,
    private readonly ratingService: RatingService,
    private readonly refundService: RefundService,
    private readonly notificationService: NotificationService,
    private readonly moderationAi: ModerationAiClient,
    @Optional()
    private readonly storageService: StorageService,
    @Optional()
    private readonly suratCargoService?: SuratCargoService,
    @Optional()
    private readonly orderService?: OrderService,
  ) { }

  // ---------- Order 48h pencere admin müdahaleleri (Faz 3B.4) ----------

  async forceCompleteOrder(
    orderId: string,
    adminId: string,
    reason?: string,
  ): Promise<{ completed: boolean }> {
    if (!this.orderService) {
      throw new Error('OrderService not available');
    }
    return this.orderService.forceComplete(orderId, adminId, reason);
  }

  async extendOrderConfirmation(
    orderId: string,
    adminId: string,
    hours: number,
    reason?: string,
  ): Promise<{ newDeadline: Date }> {
    if (!this.orderService) {
      throw new Error('OrderService not available');
    }
    return this.orderService.extendConfirmation(orderId, adminId, hours, reason);
  }

  // ---------- RefundRequest policy override (Faz 4B.1) ----------

  async overrideRefundPolicy(
    refundRequestId: string,
    adminId: string,
    payload: {
      refundProductAmount?: boolean;
      refundShippingFee?: boolean;
      refundBuyerFee?: boolean;
      refundSellerCommission?: boolean;
    },
  ) {
    return this.refundService.overrideRefundPolicy(refundRequestId, adminId, payload);
  }

  async setReturnShippingPayer(
    refundRequestId: string,
    adminId: string,
    payer: 'buyer' | 'seller' | 'platform',
  ) {
    return this.refundService.setReturnShippingPayer(refundRequestId, adminId, payer);
  }

  private resolveProductImageUrl(imageKeyOrUrl: string | null | undefined): string | null {
    if (!imageKeyOrUrl) return null;
    if (imageKeyOrUrl.startsWith('http://') || imageKeyOrUrl.startsWith('https://') || imageKeyOrUrl.startsWith('/')) return imageKeyOrUrl;
    // Try to resolve any non-URL string as an S3 key (covers dev/, prod/, and other prefixes)
    if (this.storageService) {
      return this.storageService.getPublicAssetUrl(imageKeyOrUrl) ?? null;
    }
    return null;
  }

  // ==================== COMMISSION RULES ====================

  /**
   * Get all commission rules
   */
  async getCommissionRules() {
    const rules = await this.prisma.commissionRule.findMany({
      include: { category: { select: { id: true, name: true } } },
      orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
    });

    return rules.map((r) => ({
      id: r.id,
      name: r.name,
      categoryId: r.categoryId,
      categoryName: r.category?.name || null,
      sellerType: r.sellerType,
      appliesTo: r.appliesTo || 'SELLER',
      sellerRate: r.sellerRate ? Number(r.sellerRate) : null,
      buyerRate: r.buyerRate ? Number(r.buyerRate) : null,
      sellerMin: r.sellerMin ? Number(r.sellerMin) : null,
      sellerMax: r.sellerMax ? Number(r.sellerMax) : null,
      buyerMin: r.buyerMin ? Number(r.buyerMin) : null,
      buyerMax: r.buyerMax ? Number(r.buyerMax) : null,
      isActive: r.isActive,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      // Legacy fields for backward compatibility
      percentage: Number(r.percentage),
      type: r.ruleType,
      minAmount: r.minAmount ? Number(r.minAmount) : null,
    }));
  }

  /**
   * Create commission rule
   * Requirement: Commission configuration via admin (project.md)
   */
  async createCommissionRule(adminId: string, dto: CreateCommissionRuleDto) {
    // Validate appliesTo requirements
    if (dto.appliesTo === 'SELLER' && !dto.sellerRate) {
      throw new BadRequestException('sellerRate is required when appliesTo is SELLER');
    }
    if (dto.appliesTo === 'BUYER' && !dto.buyerRate) {
      throw new BadRequestException('buyerRate is required when appliesTo is BUYER');
    }
    if (dto.appliesTo === 'BOTH' && (!dto.sellerRate || !dto.buyerRate)) {
      throw new BadRequestException('Both sellerRate and buyerRate are required when appliesTo is BOTH');
    }

    // Validate min <= max
    if (dto.sellerMin != null && dto.sellerMax != null && dto.sellerMin > dto.sellerMax) {
      throw new BadRequestException('sellerMin cannot be greater than sellerMax');
    }
    if (dto.buyerMin != null && dto.buyerMax != null && dto.buyerMin > dto.buyerMax) {
      throw new BadRequestException('buyerMin cannot be greater than buyerMax');
    }

    // If categoryId is empty string, set to null
    const categoryId = dto.categoryId && dto.categoryId.trim() !== '' ? dto.categoryId : null;

    // Check if a rule with the same combination already exists
    const existingRule = await this.prisma.commissionRule.findFirst({
      where: {
        categoryId: categoryId,
        sellerType: dto.sellerType,
        isActive: true,
      },
    });

    if (existingRule) {
      const categoryName = categoryId
        ? (await this.prisma.category.findUnique({ where: { id: categoryId }, select: { name: true } }))?.name || 'Kategori'
        : 'Tüm Kategoriler';
      const sellerTypeName = dto.sellerType === 'ALL' ? 'Tüm Satıcı Tipleri' : dto.sellerType;
      throw new BadRequestException(
        `Bu kombinasyon için zaten bir kural mevcut: ${categoryName} + ${sellerTypeName}. Aynı seviyede sadece bir kural olabilir.`
      );
    }

    const rule = await this.prisma.commissionRule.create({
      data: {
        name: dto.name,
        categoryId,
        sellerType: dto.sellerType,
        appliesTo: dto.appliesTo,
        sellerRate: dto.sellerRate != null ? dto.sellerRate : null,
        buyerRate: dto.buyerRate != null ? dto.buyerRate : null,
        sellerMin: dto.sellerMin != null ? dto.sellerMin : null,
        sellerMax: dto.sellerMax != null ? dto.sellerMax : null,
        buyerMin: dto.buyerMin != null ? dto.buyerMin : null,
        buyerMax: dto.buyerMax != null ? dto.buyerMax : null,
        priority: 0, // Priority removed - each combination can only have one rule
        isActive: dto.isActive ?? true,
        // Legacy fields (for backward compatibility)
        percentage: dto.percentage ?? (dto.sellerRate || 0),
        ruleType: dto.type || 'default',
        minAmount: dto.minAmount,
      },
      include: { category: { select: { id: true, name: true } } },
    });

    // Log action
    await this.createAuditLog(adminId, 'commission_rule_create', 'CommissionRule', rule.id, null, rule);

    return {
      id: rule.id,
      name: rule.name,
      categoryId: rule.categoryId,
      categoryName: rule.category?.name || null,
      sellerType: rule.sellerType,
      appliesTo: rule.appliesTo,
      sellerRate: rule.sellerRate ? Number(rule.sellerRate) : null,
      buyerRate: rule.buyerRate ? Number(rule.buyerRate) : null,
      sellerMin: rule.sellerMin ? Number(rule.sellerMin) : null,
      sellerMax: rule.sellerMax ? Number(rule.sellerMax) : null,
      buyerMin: rule.buyerMin ? Number(rule.buyerMin) : null,
      buyerMax: rule.buyerMax ? Number(rule.buyerMax) : null,
      isActive: rule.isActive,
      createdAt: rule.createdAt,
      updatedAt: rule.updatedAt,
      // Legacy fields
      percentage: Number(rule.percentage),
      type: rule.ruleType,
      minAmount: rule.minAmount ? Number(rule.minAmount) : null,
    };
  }

  /**
   * Update commission rule
   */
  async updateCommissionRule(adminId: string, ruleId: string, dto: UpdateCommissionRuleDto) {
    const existing = await this.prisma.commissionRule.findUnique({
      where: { id: ruleId },
    });

    if (!existing) {
      throw new NotFoundException('Komisyon kuralı bulunamadı');
    }

    // Determine final appliesTo value
    const appliesTo = dto.appliesTo ?? existing.appliesTo ?? 'SELLER';

    // Validate appliesTo requirements
    if (appliesTo === 'SELLER' && dto.sellerRate === undefined && !existing.sellerRate) {
      throw new BadRequestException('sellerRate is required when appliesTo is SELLER');
    }
    if (appliesTo === 'BUYER' && dto.buyerRate === undefined && !existing.buyerRate) {
      throw new BadRequestException('buyerRate is required when appliesTo is BUYER');
    }
    if (appliesTo === 'BOTH') {
      const finalSellerRate = dto.sellerRate !== undefined ? dto.sellerRate : existing.sellerRate;
      const finalBuyerRate = dto.buyerRate !== undefined ? dto.buyerRate : existing.buyerRate;
      if (!finalSellerRate || !finalBuyerRate) {
        throw new BadRequestException('Both sellerRate and buyerRate are required when appliesTo is BOTH');
      }
    }

    // Validate min <= max
    const sellerMin = dto.sellerMin !== undefined ? dto.sellerMin : existing.sellerMin;
    const sellerMax = dto.sellerMax !== undefined ? dto.sellerMax : existing.sellerMax;
    if (sellerMin != null && sellerMax != null && sellerMin > sellerMax) {
      throw new BadRequestException('sellerMin cannot be greater than sellerMax');
    }

    const buyerMin = dto.buyerMin !== undefined ? dto.buyerMin : existing.buyerMin;
    const buyerMax = dto.buyerMax !== undefined ? dto.buyerMax : existing.buyerMax;
    if (buyerMin != null && buyerMax != null && buyerMin > buyerMax) {
      throw new BadRequestException('buyerMin cannot be greater than buyerMax');
    }

    // Determine final categoryId and sellerType
    const finalCategoryId = dto.categoryId !== undefined
      ? (dto.categoryId && dto.categoryId.trim() !== '' ? dto.categoryId : null)
      : existing.categoryId;
    const finalSellerType = dto.sellerType !== undefined ? dto.sellerType : existing.sellerType;

    // Check if changing categoryId or sellerType would conflict with another rule
    if ((dto.categoryId !== undefined || dto.sellerType !== undefined) &&
      (finalCategoryId !== existing.categoryId || finalSellerType !== existing.sellerType)) {
      const conflictingRule = await this.prisma.commissionRule.findFirst({
        where: {
          categoryId: finalCategoryId,
          sellerType: finalSellerType,
          isActive: true,
          id: { not: existing.id }, // Exclude current rule
        },
      });

      if (conflictingRule) {
        const categoryName = finalCategoryId
          ? (await this.prisma.category.findUnique({ where: { id: finalCategoryId }, select: { name: true } }))?.name || 'Kategori'
          : 'Tüm Kategoriler';
        const sellerTypeName = finalSellerType === 'ALL' ? 'Tüm Satıcı Tipleri' : finalSellerType;
        throw new BadRequestException(
          `Bu kombinasyon başka bir kural tarafından kullanılıyor: ${categoryName} + ${sellerTypeName}. Aynı seviyede sadece bir kural olabilir.`
        );
      }
    }

    // Prepare update data
    const updateData: any = {};
    if (dto.name !== undefined) updateData.name = dto.name;
    if (dto.categoryId !== undefined) {
      updateData.categoryId = dto.categoryId && dto.categoryId.trim() !== '' ? dto.categoryId : null;
    }
    if (dto.sellerType !== undefined) updateData.sellerType = dto.sellerType;
    if (dto.appliesTo !== undefined) updateData.appliesTo = dto.appliesTo;
    if (dto.sellerRate !== undefined) updateData.sellerRate = dto.sellerRate;
    if (dto.buyerRate !== undefined) updateData.buyerRate = dto.buyerRate;
    if (dto.sellerMin !== undefined) updateData.sellerMin = dto.sellerMin;
    if (dto.sellerMax !== undefined) updateData.sellerMax = dto.sellerMax;
    if (dto.buyerMin !== undefined) updateData.buyerMin = dto.buyerMin;
    if (dto.buyerMax !== undefined) updateData.buyerMax = dto.buyerMax;
    // Priority removed - not used anymore
    if (dto.isActive !== undefined) updateData.isActive = dto.isActive;
    // Legacy fields
    if (dto.percentage !== undefined) updateData.percentage = dto.percentage;
    if (dto.type !== undefined) updateData.ruleType = dto.type;
    if (dto.minAmount !== undefined) updateData.minAmount = dto.minAmount;

    const rule = await this.prisma.commissionRule.update({
      where: { id: ruleId },
      data: updateData,
      include: { category: { select: { id: true, name: true } } },
    });

    await this.createAuditLog(adminId, 'commission_rule_update', 'CommissionRule', rule.id, existing, rule);

    return {
      id: rule.id,
      name: rule.name,
      categoryId: rule.categoryId,
      categoryName: rule.category?.name || null,
      sellerType: rule.sellerType,
      appliesTo: rule.appliesTo,
      sellerRate: rule.sellerRate ? Number(rule.sellerRate) : null,
      buyerRate: rule.buyerRate ? Number(rule.buyerRate) : null,
      sellerMin: rule.sellerMin ? Number(rule.sellerMin) : null,
      sellerMax: rule.sellerMax ? Number(rule.sellerMax) : null,
      buyerMin: rule.buyerMin ? Number(rule.buyerMin) : null,
      buyerMax: rule.buyerMax ? Number(rule.buyerMax) : null,
      isActive: rule.isActive,
      createdAt: rule.createdAt,
      updatedAt: rule.updatedAt,
      // Legacy fields
      percentage: Number(rule.percentage),
      type: rule.ruleType,
      minAmount: rule.minAmount ? Number(rule.minAmount) : null,
    };
  }

  /**
   * Delete commission rule
   */
  async deleteCommissionRule(adminId: string, ruleId: string) {
    const existing = await this.prisma.commissionRule.findUnique({
      where: { id: ruleId },
    });

    if (!existing) {
      throw new NotFoundException('Komisyon kuralı bulunamadı');
    }

    await this.prisma.commissionRule.delete({
      where: { id: ruleId },
    });

    await this.createAuditLog(adminId, 'commission_rule_delete', 'CommissionRule', ruleId, existing, null);

    return { success: true };
  }

  // ==================== PLATFORM SETTINGS ====================

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
          const basicMonthlySetting = await this.prisma.platformSetting.findUnique({
            where: { settingKey: 'basic_monthly_price' },
          });
          const basicMonthly = basicMonthlySetting
            ? parseFloat(basicMonthlySetting.settingValue)
            : (dto.key === 'basic_monthly_price' ? parseFloat(dto.value) : null);

          if (basicMonthly !== null && !isNaN(basicMonthly)) {
            const basicYearly = basicMonthly * 12 * (1 - finalDiscount / 100);
            const basicTier = await this.prisma.membershipTier.findUnique({
              where: { type: 'basic' },
            });

            if (basicTier) {
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
        }

        if (dto.key === 'premium_monthly_price' || dto.key === 'yearly_discount_percentage') {
          // Update premium tier
          const premiumMonthlySetting = await this.prisma.platformSetting.findUnique({
            where: { settingKey: 'premium_monthly_price' },
          });
          const premiumMonthly = premiumMonthlySetting
            ? parseFloat(premiumMonthlySetting.settingValue)
            : (dto.key === 'premium_monthly_price' ? parseFloat(dto.value) : null);

          if (premiumMonthly !== null && !isNaN(premiumMonthly)) {
            const premiumYearly = premiumMonthly * 12 * (1 - finalDiscount / 100);
            const premiumTier = await this.prisma.membershipTier.findUnique({
              where: { type: 'premium' },
            });

            if (premiumTier) {
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
        }

        if (dto.key === 'business_monthly_price' || dto.key === 'yearly_discount_percentage') {
          // Update business tier
          const businessMonthlySetting = await this.prisma.platformSetting.findUnique({
            where: { settingKey: 'business_monthly_price' },
          });
          const businessMonthly = businessMonthlySetting
            ? parseFloat(businessMonthlySetting.settingValue)
            : (dto.key === 'business_monthly_price' ? parseFloat(dto.value) : null);

          if (businessMonthly !== null && !isNaN(businessMonthly)) {
            const businessYearly = businessMonthly * 12 * (1 - finalDiscount / 100);
            const businessTier = await this.prisma.membershipTier.findUnique({
              where: { type: 'business' },
            });

            if (businessTier) {
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
      await this.createAuditLog(adminUser.id, 'setting_update', 'PlatformSetting', setting.id, existing, setting);
    }

    return setting;
  }

  // ==================== USER MANAGEMENT ====================

  /**
   * Get users with filters
   */
  async getUsers(query: AdminUserQueryDto) {
    const { search, isSeller, isVerified, page = 1, limit = 20 } = query;

    const where: Prisma.UserWhereInput = {};

    if (search) {
      const userIds = await fulltextUserSearch(this.prisma, search);
      if (userIds.length === 0) {
        return { data: [], total: 0, page, limit, totalPages: 0 };
      }
      where.id = { in: userIds };
    }

    if (isSeller !== undefined) {
      where.isSeller = isSeller;
    }

    if (isVerified !== undefined) {
      where.isVerified = isVerified;
    }

    if (query.isBanned === true) {
      where.isBanned = true;
    }

    const [total, users] = await Promise.all([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        select: {
          id: true,
          email: true,
          displayName: true,
          phone: true,
          isSeller: true,
          sellerType: true,
          isVerified: true,
          isBanned: true,
          createdAt: true,
          lastLoginAt: true,
          lastActivityAt: true,
          _count: {
            select: {
              products: true,
              buyerOrders: true,
              sellerOrders: true,
            },
          },
        },
        orderBy: [
          { lastLoginAt: { sort: 'desc', nulls: 'last' } },
          { createdAt: 'desc' },
        ],
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return {
      data: users,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  /**
   * Get user by ID with full details
   * Requirement: GET /admin/users/:id (project.txt)
   */
  async getUserById(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        addresses: true,
        products: {
          take: 10,
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            title: true,
            price: true,
            status: true,
            createdAt: true,
            images: { take: 1, select: { cardKey: true } },
          },
        },
        buyerOrders: {
          take: 10,
          orderBy: { createdAt: 'desc' },
          include: {
            seller: { select: { id: true, displayName: true } },
            product: { select: { id: true, title: true } },
          },
        },
        sellerOrders: {
          take: 10,
          orderBy: { createdAt: 'desc' },
          include: {
            buyer: { select: { id: true, displayName: true } },
            product: { select: { id: true, title: true } },
          },
        },
        initiatedTrades: {
          take: 10,
          orderBy: { createdAt: 'desc' },
          include: {
            receiver: { select: { id: true, displayName: true } },
            items: { include: { product: { select: { id: true, title: true } } } },
          },
        },
        receivedTrades: {
          take: 10,
          orderBy: { createdAt: 'desc' },
          include: {
            initiator: { select: { id: true, displayName: true } },
            items: { include: { product: { select: { id: true, title: true } } } },
          },
        },
        givenRatings: {
          take: 5,
          orderBy: { createdAt: 'desc' },
          include: {
            receiver: { select: { id: true, displayName: true } },
          },
        },
        receivedRatings: {
          take: 5,
          orderBy: { createdAt: 'desc' },
          include: {
            giver: { select: { id: true, displayName: true } },
          },
        },
        membership: {
          include: {
            tier: true,
          },
        },
        _count: {
          select: {
            products: true,
            buyerOrders: true,
            sellerOrders: true,
            givenRatings: true,
            receivedRatings: true,
            initiatedTrades: true,
            receivedTrades: true,
            sentMessages: true,
            receivedMessages: true,
          },
        },
      },
    });

    if (!user) {
      throw new NotFoundException('Kullanıcı bulunamadı');
    }

    const u = user as typeof user & {
      receivedRatings: Array<{ score: number }>;
      initiatedTrades: Array<{ createdAt: Date }>;
      receivedTrades: Array<{ createdAt: Date }>;
      buyerOrders: Array<{ totalAmount: unknown; commissionAmount: unknown; seller: unknown }>;
      sellerOrders: Array<{ totalAmount: unknown; commissionAmount: unknown; buyer: unknown }>;
      products: Array<{ images?: Array<{ cardKey: string }> }>;
      givenRatings: unknown[];
      _count: { products: number; buyerOrders: number; sellerOrders: number; givenRatings: number; receivedRatings: number; initiatedTrades: number; receivedTrades: number; sentMessages: number; receivedMessages: number };
    };

    const avgRating = u.receivedRatings.length > 0
      ? u.receivedRatings.reduce((sum, r) => sum + r.score, 0) / u.receivedRatings.length
      : null;

    const allTrades = [
      ...u.initiatedTrades.map((t) => ({ ...t, role: 'initiator' as const })),
      ...u.receivedTrades.map((t) => ({ ...t, role: 'receiver' as const })),
    ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 10);

    const allOrders = [
      ...u.buyerOrders.map((o) => ({
        ...o,
        role: 'buyer' as const,
        totalAmount: Number(o.totalAmount),
        commissionAmount: Number(o.commissionAmount),
        otherParty: o.seller,
      })),
      ...u.sellerOrders.map((o) => ({
        ...o,
        role: 'seller' as const,
        totalAmount: Number(o.totalAmount),
        commissionAmount: Number(o.commissionAmount),
        otherParty: o.buyer,
      })),
    ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 10);

    return {
      ...u,
      lastLoginAt: u.lastLoginAt ?? null,
      lastActivityAt: u.lastActivityAt ?? null,
      averageRating: avgRating ? Math.round(avgRating * 10) / 10 : null,
      products: await Promise.all(u.products.map(async (p) => ({
        ...p,
        price: Number(p.price),
        imageUrl: this.resolveProductImageUrl(p.images?.[0]?.cardKey) || null,
      }))),
      recentOrders: allOrders,
      recentTrades: allTrades.map((t) => ({
        ...t,
        cashAmount: (t as any).cashAmount ? Number((t as any).cashAmount) : null,
      })),
      givenRatings: u.givenRatings,
      receivedRatings: u.receivedRatings,
      stats: {
        productsCount: u._count.products,
        ordersCount: u._count.buyerOrders + u._count.sellerOrders,
        buyerOrdersCount: u._count.buyerOrders,
        sellerOrdersCount: u._count.sellerOrders,
        tradesCount: u._count.initiatedTrades + u._count.receivedTrades,
        initiatedTradesCount: u._count.initiatedTrades,
        receivedTradesCount: u._count.receivedTrades,
        messagesCount: u._count.sentMessages + u._count.receivedMessages,
        sentMessagesCount: u._count.sentMessages,
        receivedMessagesCount: u._count.receivedMessages,
        givenRatingsCount: u._count.givenRatings,
        receivedRatingsCount: u._count.receivedRatings,
      },
    };
  }

  // ==================== ADMIN STAFF (admin rol yönetimi) ====================

  /** Acting kullanıcının (User.id) AdminUser.id'sini çöz (audit/createdBy için). */
  private async resolveAdminUserId(userId: string): Promise<string | undefined> {
    const a = await this.prisma.adminUser.findFirst({
      where: { userId },
      select: { id: true },
    });
    return a?.id;
  }

  private shapeStaff(
    s: { id: string; userId: string; role: AdminRole; isActive: boolean; lastLoginAt: Date | null; createdAt: Date },
    user: { email: string; displayName: string | null },
  ) {
    return {
      id: s.id,
      userId: s.userId,
      email: user.email,
      name: user.displayName ?? user.email,
      role: s.role,
      isActive: s.isActive,
      lastLoginAt: s.lastLoginAt ?? null,
      createdAt: s.createdAt,
    };
  }

  /** Best-effort audit kaydı (admin rol işlemleri akışı bloke etmesin). */
  private async auditStaff(actingUserId: string, action: string, id: string, oldV: any, newV: any) {
    try {
      const adminUserId = await this.resolveAdminUserId(actingUserId);
      if (adminUserId) {
        await this.createAuditLog(adminUserId, action, 'AdminUser', id, oldV, newV);
      }
    } catch {
      /* audit hatası işlemi bloke etmesin */
    }
  }

  private readonly STAFF_ASSIGN_SETTING_KEY = 'allow_admin_assign_roles';

  /** İşlemi yapan kullanıcının (User.id) AdminUser kaydı (id + rol). */
  private async resolveActingAdmin(
    userId: string,
  ): Promise<{ id: string; role: AdminRole } | null> {
    const a = await this.prisma.adminUser.findFirst({
      where: { userId },
      select: { id: true, role: true },
    });
    return a ?? null;
  }

  /** Yöneticilerin de rol atayıp atayamayacağı ayarı. */
  async getStaffSettings() {
    const s = await this.prisma.platformSetting.findUnique({
      where: { settingKey: this.STAFF_ASSIGN_SETTING_KEY },
    });
    return { allowAdminAssign: s?.settingValue === 'true' };
  }

  /** Ayarı güncelle (yalnız super_admin controller'da kilitli). */
  async setStaffSettings(actingUserId: string, dto: UpdateStaffSettingsDto) {
    const updatedBy = await this.resolveAdminUserId(actingUserId);
    const value = dto.allowAdminAssign ? 'true' : 'false';
    await this.prisma.platformSetting.upsert({
      where: { settingKey: this.STAFF_ASSIGN_SETTING_KEY },
      create: {
        settingKey: this.STAFF_ASSIGN_SETTING_KEY,
        settingValue: value,
        settingType: 'boolean',
        description: 'Yöneticiler (admin) de admin rolü atayabilsin mi (süper_admin hariç)',
        updatedBy,
      },
      update: { settingValue: value, updatedBy },
    });
    return { allowAdminAssign: dto.allowAdminAssign };
  }

  /** İşlemi yapan kişi, ilgili rol(ler) üzerinde işlem yapabilir mi? */
  private async assertCanManage(
    actingUserId: string,
    ...involvedRoles: (AdminRole | undefined)[]
  ) {
    const acting = await this.resolveActingAdmin(actingUserId);
    if (!acting) throw new ForbiddenException('Bu işlem için yetkiniz yok');
    if (acting.role === AdminRole.super_admin) return; // süper admin her şeyi yapar
    if (acting.role === AdminRole.admin) {
      const { allowAdminAssign } = await this.getStaffSettings();
      if (!allowAdminAssign) {
        throw new ForbiddenException(
          'Rol atama yetkisi yalnızca süper adminde (yönetici izni kapalı)',
        );
      }
      if (involvedRoles.includes(AdminRole.super_admin)) {
        throw new ForbiddenException(
          'Süper admin rolüyle ilgili işlemi yalnızca süper admin yapabilir',
        );
      }
      return;
    }
    throw new ForbiddenException('Bu işlem için yetkiniz yok');
  }

  /** Yeni admin hesabı için okunabilir geçici şifre üret. */
  private generateTempPassword(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
    let p = '';
    for (let i = 0; i < 10; i++) {
      p += chars[Math.floor(Math.random() * chars.length)];
    }
    return p + '!9';
  }

  /** Tüm admin personeli + rol başına (aktif) sayıları döndür. */
  async listAdminStaff() {
    const staff = await this.prisma.adminUser.findMany({
      include: { user: { select: { email: true, displayName: true } } },
      orderBy: { createdAt: 'asc' },
    });
    const roleCounts: Record<string, number> = {
      super_admin: 0,
      admin: 0,
      moderator: 0,
    };
    const items = staff.map((s) => {
      if (s.isActive) roleCounts[s.role] = (roleCounts[s.role] ?? 0) + 1;
      return this.shapeStaff(s, s.user);
    });
    return { items, roleCounts };
  }

  /** Bir e-postaya admin rolü ata. Kayıtlı değilse hesabı sistem oluşturur (admin daveti). */
  async assignAdminStaff(actingUserId: string, dto: AssignAdminStaffDto) {
    await this.assertCanManage(actingUserId, dto.role);
    const email = dto.email.toLowerCase().trim();
    let user = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true, displayName: true },
    });

    // Kayıt yoksa hesabı oluştur. Şifre verilmediyse geçici üret + yanıtta döndür (süper admin paylaşsın).
    let tempPassword: string | undefined;
    if (!user) {
      const rawPassword = dto.password || this.generateTempPassword();
      if (!dto.password) tempPassword = rawPassword;
      const passwordHash = await bcrypt.hash(rawPassword, 12);
      const displayName = dto.displayName?.trim() || email.split('@')[0];
      user = await this.prisma.user.create({
        data: {
          email,
          passwordHash,
          displayName,
          isEmailVerified: true,
          isVerified: true,
        },
        select: { id: true, email: true, displayName: true },
      });
    }

    const existing = await this.prisma.adminUser.findUnique({
      where: { userId: user.id },
    });
    if (existing) {
      await this.assertCanManage(actingUserId, existing.role, dto.role);
      const updated = await this.prisma.adminUser.update({
        where: { id: existing.id },
        data: { role: dto.role, isActive: true },
      });
      await this.auditStaff(actingUserId, 'admin_staff_update', updated.id, existing, updated);
      return { ...this.shapeStaff(updated, user), tempPassword };
    }

    const createdBy = await this.resolveAdminUserId(actingUserId);
    const created = await this.prisma.adminUser.create({
      data: { userId: user.id, role: dto.role, isActive: true, createdBy },
    });
    await this.auditStaff(actingUserId, 'admin_staff_create', created.id, null, created);
    return { ...this.shapeStaff(created, user), tempPassword };
  }

  /** Admin personelin rolünü/aktifliğini güncelle. */
  async updateAdminStaff(actingUserId: string, id: string, dto: UpdateAdminStaffDto) {
    const existing = await this.prisma.adminUser.findUnique({
      where: { id },
      include: { user: { select: { email: true, displayName: true } } },
    });
    if (!existing) throw new NotFoundException('Admin kaydı bulunamadı');
    await this.assertCanManage(actingUserId, existing.role, dto.role);

    // Son aktif süper admin'i düşürme/pasifleştirme engeli (sistemi yetkisiz bırakmamak için).
    const downgradingLastSuper =
      existing.role === AdminRole.super_admin &&
      (dto.isActive === false || (dto.role != null && dto.role !== AdminRole.super_admin));
    if (downgradingLastSuper) {
      const activeSupers = await this.prisma.adminUser.count({
        where: { role: AdminRole.super_admin, isActive: true },
      });
      if (activeSupers <= 1) {
        throw new BadRequestException('Sistemdeki son süper admin değiştirilemez');
      }
    }

    const updated = await this.prisma.adminUser.update({
      where: { id },
      data: {
        ...(dto.role ? { role: dto.role } : {}),
        ...(dto.isActive != null ? { isActive: dto.isActive } : {}),
      },
    });
    await this.auditStaff(actingUserId, 'admin_staff_update', id, existing, updated);
    return this.shapeStaff(updated, existing.user);
  }

  /** Admin yetkisini tamamen kaldır (AdminUser sil). */
  async removeAdminStaff(actingUserId: string, id: string) {
    const existing = await this.prisma.adminUser.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Admin kaydı bulunamadı');
    await this.assertCanManage(actingUserId, existing.role);

    const acting = await this.prisma.adminUser.findFirst({
      where: { userId: actingUserId },
      select: { id: true },
    });
    if (acting?.id === id) {
      throw new BadRequestException('Kendi admin yetkinizi kaldıramazsınız');
    }
    if (existing.role === AdminRole.super_admin) {
      const activeSupers = await this.prisma.adminUser.count({
        where: { role: AdminRole.super_admin, isActive: true },
      });
      if (activeSupers <= 1) {
        throw new BadRequestException('Sistemdeki son süper admin kaldırılamaz');
      }
    }

    await this.prisma.adminUser.delete({ where: { id } });
    await this.auditStaff(actingUserId, 'admin_staff_delete', id, existing, null);
    return { success: true };
  }

  /**
   * Ban user
   * - Sets isBanned = true
   * - Sets bannedAt, bannedReason, bannedBy
   * - Sets active products to inactive
   * - Sets pending products to rejected
   * - Cancels active offers
   * - All in a transaction (all or nothing)
   */
  async banUser(adminId: string, userId: string, dto: BanUserDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('Kullanıcı bulunamadı');
    }

    if ((user as any).isBanned) {
      throw new BadRequestException('Kullanıcı zaten banlı');
    }

    return this.prisma.$transaction(async (tx) => {
      // 1. User'ı banla
      const updatedUser = await tx.user.update({
        where: { id: userId },
        data: {
          isBanned: true,
          bannedAt: new Date(),
          bannedReason: dto.reason,
          bannedBy: adminId,
        } as any,
      });

      // 2. Aktif ürünleri inactive yap
      await tx.product.updateMany({
        where: {
          sellerId: userId,
          status: ProductStatus.active,
        },
        data: {
          status: ProductStatus.inactive,
        },
      });

      // 3. Bekleyen ürünleri rejected yap
      await tx.product.updateMany({
        where: {
          sellerId: userId,
          status: ProductStatus.pending,
        },
        data: {
          status: ProductStatus.rejected,
        },
      });

      // 4. Aktif teklifleri cancelled yap (buyer olarak)
      await tx.offer.updateMany({
        where: {
          buyerId: userId,
          status: OfferStatus.pending,
        },
        data: {
          status: OfferStatus.cancelled,
        },
      });

      // 5. Audit log oluştur
      await this.createAuditLog(adminId, 'user_ban', 'User', userId, user, updatedUser);

      this.logger.warn(`User ${userId} banned by admin ${adminId}: ${dto.reason}`);

      return { success: true, userId, reason: dto.reason };
    });
  }

  // ==================== PRODUCT MANAGEMENT ====================

  /**
   * Get products with filters
   */
  async getProducts(query: AdminProductQueryDto) {
    const { search, status, categoryId, sellerId, page = 1, limit = 20 } = query;

    const where: Prisma.ProductWhereInput = {};

    if (search) {
      const productIds = await fulltextProductSearch(this.prisma, search);
      if (productIds.length === 0) {
        return { data: [], total: 0, page, limit, totalPages: 0 };
      }
      where.id = { in: productIds };
    }

    if (status) {
      where.status = status;
    }

    if (categoryId) {
      where.categoryId = categoryId;
    }

    if (sellerId) {
      where.sellerId = sellerId;
    }

    const [total, products] = await Promise.all([
      this.prisma.product.count({ where }),
      this.prisma.product.findMany({
        where,
        include: {
          seller: { select: { id: true, displayName: true, email: true } },
          category: { select: { id: true, name: true } },
          images: { take: 1, orderBy: { sortOrder: 'asc' } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    // Calculate campaign prices for each product
    const productsWithCampaignPrices = await Promise.all(
      products.map(async (p) => {
        const basePrice = Number(p.price);

        // Get campaign discount price from DiscountService
        const campaignPrice = await this.discountService.getEffectiveDisplayPrice(
          p.id,
          p.sellerId,
          p.categoryId ?? undefined,
          basePrice,
        );

        const effectivePrice = campaignPrice ?? basePrice;
        const hasDiscount = effectivePrice < basePrice;

        // Convert S3 key to presigned URL for image
        const imageUrl = this.resolveProductImageUrl(p.images[0]?.cardKey);

        return {
          ...p,
          price: effectivePrice,
          originalPrice: hasDiscount ? basePrice : (p.originalPrice != null ? Number(p.originalPrice) : null),
          salePrice: p.salePrice != null ? Number(p.salePrice) : null,
          isOnSale: hasDiscount || (p.salePrice != null && Number(p.salePrice) < basePrice),
          imageUrl,
        };
      }),
    );

    return {
      data: productsWithCampaignPrices,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  /**
   * Export products to CSV format
   */
  async exportProducts(query: { status?: string; categoryId?: string; sellerId?: string }) {
    const where: Prisma.ProductWhereInput = {};

    if (query.status) {
      where.status = query.status as ProductStatus;
    }
    if (query.categoryId) {
      where.categoryId = query.categoryId;
    }
    if (query.sellerId) {
      where.sellerId = query.sellerId;
    }

    const products = await this.prisma.product.findMany({
      where,
      include: {
        seller: { select: { displayName: true, email: true } },
        category: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Create CSV header
    const headers = ['ID', 'Başlık', 'Fiyat', 'Durum', 'Kondisyon', 'Kategori', 'Satıcı', 'Satıcı Email', 'Oluşturulma Tarihi'];

    // Create CSV rows
    const rows = products.map(p => [
      p.id,
      `"${(p.title || '').replace(/"/g, '""')}"`,
      Number(p.price).toFixed(2),
      p.status,
      p.condition,
      p.category?.name || '',
      p.seller?.displayName || '',
      p.seller?.email || '',
      new Date(p.createdAt).toISOString(),
    ]);

    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');

    return {
      filename: `products_${new Date().toISOString().split('T')[0]}.csv`,
      content: csv,
      mimeType: 'text/csv',
    };
  }

  /**
   * Get single product by ID (admin)
   */
  async getProduct(productId: string) {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      include: {
        seller: { select: { id: true, displayName: true, email: true } },
        category: { select: { id: true, name: true, slug: true } },
        images: { orderBy: { sortOrder: 'asc' } },
      },
    });
    if (!product) {
      throw new NotFoundException('Ürün bulunamadı');
    }

    // Convert S3 keys to presigned URLs for all images
    const imagesWithPresignedUrls = await Promise.all(
      product.images.map(async (img) => ({
        ...img,
        url: this.resolveProductImageUrl(img.cardKey),
      })),
    );

    return {
      ...product,
      images: imagesWithPresignedUrls,
      price: Number(product.price),
      originalPrice: product.originalPrice != null ? Number(product.originalPrice) : null,
      salePrice: product.salePrice != null ? Number(product.salePrice) : null,
    };
  }

  /**
   * Update product details
   */
  async updateProduct(adminId: string, productId: string, dto: UpdateProductDto) {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
    });

    if (!product) {
      throw new NotFoundException('Ürün bulunamadı');
    }

    const data: Prisma.ProductUpdateInput = {};

    if (dto.title !== undefined) data.title = dto.title;
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.price !== undefined) data.price = dto.price;
    if (dto.oldPrice !== undefined) data.oldPrice = dto.oldPrice;
    if (dto.quantity !== undefined) {
      data.quantity = dto.quantity;
    }
    // Açıkça seçilen status admin'in override'ı olarak öncelikli — aksi halde
    // düzenleme formu quantity'yi de gönderdiğinden status her zaman miktardan
    // türetilir ve stoklu ürün "Pasif"e alınamazdı. Status verilmediyse ve
    // quantity değiştiyse, status'ü miktardan türet (0 → inactive).
    if (dto.status !== undefined) {
      data.status = dto.status;
    } else if (dto.quantity !== undefined) {
      data.status = getProductStatusFromQuantity(dto.quantity);
    }
    if (dto.condition !== undefined) data.condition = dto.condition;
    if (dto.categoryId !== undefined) {
      data.category = { connect: { id: dto.categoryId } };
    }

    const updated = await this.prisma.product.update({
      where: { id: productId },
      data,
      include: {
        category: { select: { id: true, name: true, slug: true } },
        seller: { select: { id: true, displayName: true, email: true } },
        images: { orderBy: { sortOrder: 'asc' } },
      },
    });

    await this.createAuditLog(adminId, 'product_update', 'Product', productId, product, updated);


    // Invalidate caches
    if (this.cache) {
      await this.cache.del(`product:${productId}`);
      await this.cache.delPattern('products:list:*');
    }

    return updated;
  }

  /**
   * Approve product
   * Requirement: Listing approval (project.md)
   */
  async approveProduct(adminId: string, productId: string, dto: ApproveProductDto) {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
    });

    if (!product) {
      throw new NotFoundException('Ürün bulunamadı');
    }

    if (product.status !== ProductStatus.pending) {
      throw new BadRequestException('Sadece bekleyen ürünler onaylanabilir');
    }

    const updated = await this.prisma.product.update({
      where: { id: productId },
      data: { status: ProductStatus.active },
    });

    await this.createAuditLog(adminId, 'product_approve', 'Product', productId, product, updated);


    // Invalidate product cache so the product appears in listings
    await this.cache.del(`product:${productId}`);
    await this.cache.delPattern('products:list:*');

    // Yeniden satışa açılan (eski sold/inactive) ilan onaylanıp yayına girince
    // wishlist + son 7 gün stockout-cancelled alıcılara back-in-stock bildirimi
    // gönder. Yeni ilanlarda wishlist boş olacağından zararsızdır. Bildirim
    // hatası onayı bloke etmesin.
    this.notificationService
      .broadcastBackInStock(productId, product.title)
      .catch((err) =>
        this.logger.warn(`broadcastBackInStock failed for ${productId}: ${err?.message}`),
      );

    return { success: true, productId, status: 'active' };
  }

  /**
   * Reject product
   */
  async rejectProduct(adminId: string, productId: string, dto: RejectProductDto) {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
    });

    if (!product) {
      throw new NotFoundException('Ürün bulunamadı');
    }

    const updated = await this.prisma.product.update({
      where: { id: productId },
      data: { status: ProductStatus.rejected },
    });

    await this.createAuditLog(adminId, 'product_reject', 'Product', productId, product, { ...updated, reason: dto.reason });

    // Satıcıya in-app bildirim: ilan reddedildi (neden ile). Bildirim hatası reddi bloke etmesin.
    try {
      await this.notificationService.createInAppNotification(
        product.sellerId,
        NotificationType.PRODUCT_REJECTED,
        { productTitle: product.title, reason: dto.reason },
      );
    } catch (err: any) {
      this.logger.warn(`PRODUCT_REJECTED notification failed for ${productId}: ${err?.message}`);
    }

    // Invalidate product cache
    await this.cache.del(`product:${productId}`);
    await this.cache.delPattern('products:list:*');

    return { success: true, productId, status: 'rejected', reason: dto.reason };
  }

  /**
   * Bulk approve multiple products
   */
  async bulkApproveProducts(adminId: string, ids: string[], note?: string) {
    if (!ids || ids.length === 0) {
      throw new BadRequestException('En az bir ürün seçilmelidir');
    }

    const results: { id: string; success: boolean; error?: string }[] = [];

    for (const productId of ids) {
      try {
        const product = await this.prisma.product.findUnique({
          where: { id: productId },
        });

        if (!product) {
          results.push({ id: productId, success: false, error: 'Ürün bulunamadı' });
          continue;
        }

        if (product.status !== ProductStatus.pending) {
          results.push({ id: productId, success: false, error: 'Sadece bekleyen ürünler onaylanabilir' });
          continue;
        }

        const updated = await this.prisma.product.update({
          where: { id: productId },
          data: { status: ProductStatus.active },
        });

        await this.createAuditLog(adminId, 'product_bulk_approve', 'Product', productId, product, { ...updated, note });


        // Invalidate product cache
        await this.cache.del(`product:${productId}`);

        results.push({ id: productId, success: true });
      } catch (error) {
        results.push({ id: productId, success: false, error: error.message });
      }
    }

    // Invalidate product list cache
    await this.cache.delPattern('products:list:*');

    const successCount = results.filter(r => r.success).length;
    const failCount = results.filter(r => !r.success).length;

    return {
      success: true,
      message: `${successCount} ürün onaylandı${failCount > 0 ? `, ${failCount} ürün başarısız oldu` : ''}`,
      results,
    };
  }

  /**
   * Bulk reject multiple products
   */
  async bulkRejectProducts(adminId: string, ids: string[], reason: string) {
    if (!ids || ids.length === 0) {
      throw new BadRequestException('En az bir ürün seçilmelidir');
    }

    if (!reason || reason.trim() === '') {
      throw new BadRequestException('Red sebebi zorunludur');
    }

    const results: { id: string; success: boolean; error?: string }[] = [];

    for (const productId of ids) {
      try {
        const product = await this.prisma.product.findUnique({
          where: { id: productId },
        });

        if (!product) {
          results.push({ id: productId, success: false, error: 'Ürün bulunamadı' });
          continue;
        }

        const updated = await this.prisma.product.update({
          where: { id: productId },
          data: { status: ProductStatus.rejected },
        });

        await this.createAuditLog(adminId, 'product_bulk_reject', 'Product', productId, product, { ...updated, reason });

        // Invalidate product cache
        await this.cache.del(`product:${productId}`);

        results.push({ id: productId, success: true });
      } catch (error) {
        results.push({ id: productId, success: false, error: error.message });
      }
    }

    // Invalidate product list cache
    await this.cache.delPattern('products:list:*');

    const successCount = results.filter(r => r.success).length;
    const failCount = results.filter(r => !r.success).length;

    return {
      success: true,
      message: `${successCount} ürün reddedildi${failCount > 0 ? `, ${failCount} ürün başarısız oldu` : ''}`,
      results,
      reason,
    };
  }

  // ==================== ORDER MANAGEMENT ====================

  /**
   * Get orders with filters
   */
  async getOrders(query: AdminOrderQueryDto) {
    const { search, status, fromDate, toDate, userId, userRole, productId, page = 1, limit = 20 } = query;

    const where: Prisma.OrderWhereInput = {};

    if (search) {
      where.OR = [
        { orderNumber: { contains: search, mode: 'insensitive' } },
        { buyer: { displayName: { contains: search, mode: 'insensitive' } } },
        { seller: { displayName: { contains: search, mode: 'insensitive' } } },
        { product: { title: { contains: search, mode: 'insensitive' } } },
      ];
    }

    if (status) {
      where.status = status;
    }

    if (userId) {
      if (userRole === 'buyer') {
        where.buyerId = userId;
      } else if (userRole === 'seller') {
        where.sellerId = userId;
      } else {
        where.OR = [
          { buyerId: userId },
          { sellerId: userId },
        ];
      }
    }

    if (productId) {
      where.productId = productId;
    }

    if (fromDate || toDate) {
      where.createdAt = {};
      if (fromDate) {
        where.createdAt.gte = new Date(fromDate);
      }
      if (toDate) {
        where.createdAt.lte = new Date(toDate);
      }
    }

    const [total, orders] = await Promise.all([
      this.prisma.order.count({ where }),
      this.prisma.order.findMany({
        where,
        include: {
          buyer: { select: { id: true, displayName: true, email: true } },
          seller: { select: { id: true, displayName: true, email: true } },
          product: { select: { id: true, title: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return {
      data: orders.map((o) => ({
        ...o,
        amount: Number(o.totalAmount),
        commissionAmount: Number(o.commissionAmount),
      })),
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  /**
   * Get disputed orders
   * Requirement: GET /admin/orders/disputes (project.txt)
   */
  async getDisputedOrders(query: AdminOrderQueryDto) {
    const { fromDate, toDate, page = 1, limit = 20 } = query;

    const where: Prisma.OrderWhereInput = {
      status: { in: [OrderStatus.refund_requested, OrderStatus.cancelled] },
    };

    if (fromDate || toDate) {
      where.createdAt = {};
      if (fromDate) {
        where.createdAt.gte = new Date(fromDate);
      }
      if (toDate) {
        where.createdAt.lte = new Date(toDate);
      }
    }

    const [total, orders] = await Promise.all([
      this.prisma.order.count({ where }),
      this.prisma.order.findMany({
        where,
        include: {
          buyer: { select: { id: true, displayName: true, email: true } },
          seller: { select: { id: true, displayName: true, email: true } },
          product: { select: { id: true, title: true } },
          payment: { select: { id: true, status: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return {
      data: orders.map((o) => ({
        ...o,
        amount: Number(o.totalAmount),
        commissionAmount: Number(o.commissionAmount),
      })),
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  /**
   * Resolve order dispute
   */
  async resolveDispute(adminId: string, orderId: string, dto: ResolveDisputeDto) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
    });

    if (!order) {
      throw new NotFoundException('Sipariş bulunamadı');
    }

    // Handle resolution based on type
    let newStatus: OrderStatus;
    switch (dto.resolution) {
      case 'buyer_refund':
        newStatus = OrderStatus.refunded;
        break;
      case 'seller_favor':
        newStatus = OrderStatus.completed;
        break;
      case 'partial_refund':
        newStatus = OrderStatus.refunded;
        break;
      case 'dismissed':
        newStatus = order.status; // Keep current status
        break;
      default:
        newStatus = order.status;
    }

    const updated = await this.prisma.order.update({
      where: { id: orderId },
      data: { status: newStatus },
    });

    await this.createAuditLog(adminId, 'dispute_resolve', 'Order', orderId, order, {
      ...updated,
      resolution: dto.resolution,
      note: dto.note,
    });

    return { success: true, orderId, resolution: dto.resolution, newStatus };
  }

  // ==================== ANALYTICS & REPORTS ====================

  /**
   * Get dashboard statistics
   * Requirement: Reporting dashboards (project.md)
   */
  async getDashboardStats() {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const [
      totalUsers,
      newUsers7d,
      totalProducts,
      activeProducts,
      pendingProducts,
      totalOrders,
      orders7d,
      completedOrders,
      totalRevenue,
      revenue7d,
      byCategory,
    ] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.user.count({ where: { createdAt: { gte: sevenDaysAgo } } }),
      this.prisma.product.count(),
      this.prisma.product.count({ where: { status: ProductStatus.active } }),
      this.prisma.product.count({ where: { status: ProductStatus.pending } }),
      this.prisma.order.count(),
      this.prisma.order.count({ where: { createdAt: { gte: sevenDaysAgo } } }),
      this.prisma.order.count({ where: { status: OrderStatus.completed } }),
      this.prisma.order.aggregate({
        _sum: { commissionAmount: true },
        where: { status: { in: [OrderStatus.completed, OrderStatus.delivered] } },
      }),
      this.prisma.order.aggregate({
        _sum: { commissionAmount: true },
        where: {
          createdAt: { gte: sevenDaysAgo },
          status: { in: [OrderStatus.completed, OrderStatus.delivered] },
        },
      }),
      this.prisma.product.groupBy({
        by: ['categoryId'],
        _count: { id: true },
      }),
    ]);

    const categoryIds = [...new Set(byCategory.map((c) => c.categoryId).filter(Boolean))] as string[];
    const categories = categoryIds.length > 0
      ? await this.prisma.category.findMany({
        where: { id: { in: categoryIds } },
        select: { id: true, name: true },
      })
      : [];
    const categoryMap = new Map(categories.map((c) => [c.id, c.name]));
    const categoryDistribution = byCategory
      .map((c) => ({
        name: c.categoryId ? (categoryMap.get(c.categoryId) || 'Kategorisiz') : 'Kategorisiz',
        count: c._count.id,
      }))
      .sort((a, b) => b.count - a.count);

    return {
      users: {
        total: totalUsers,
        new7d: newUsers7d,
      },
      products: {
        total: totalProducts,
        active: activeProducts,
        pending: pendingProducts,
      },
      orders: {
        total: totalOrders,
        last7d: orders7d,
        completed: completedOrders,
      },
      revenue: {
        total: Number(totalRevenue._sum.commissionAmount || 0),
        last7d: Number(revenue7d._sum.commissionAmount || 0),
      },
      categoryDistribution,
    };
  }

  /**
   * Save analytics snapshot
   */
  async saveAnalyticsSnapshot() {
    const stats = await this.getDashboardStats();

    const snapshot = await this.prisma.analyticsSnapshot.create({
      data: {
        snapshotType: 'daily',
        snapshotDate: new Date(),
        totalUsers: stats.users.total,
        totalProducts: stats.products.total,
        totalOrders: stats.orders.total,
        totalRevenue: stats.revenue.total,
        newUsers: stats.users.new7d,
        newOrders: stats.orders.last7d,
        data: stats as any,
      },
    });

    return snapshot;
  }

  /**
   * Get sales analytics with date range
   * Requirement: GET /admin/analytics/sales (7.2)
   */
  async getSalesAnalytics(query: AnalyticsQueryDto) {
    const endDateRaw = query.endDate ? new Date(query.endDate) : new Date();
    const endDate = new Date(endDateRaw);
    endDate.setHours(23, 59, 59, 999);
    const startDate = query.startDate
      ? new Date(query.startDate)
      : new Date(endDate.getTime() - 30 * 24 * 60 * 60 * 1000);
    startDate.setHours(0, 0, 0, 0);

    const completedStatuses = [OrderStatus.completed, OrderStatus.delivered, OrderStatus.paid] as const;
    const [orders, ordersByStatus] = await Promise.all([
      this.prisma.order.findMany({
        where: {
          createdAt: { gte: startDate, lte: endDate },
          status: { in: [...completedStatuses] },
        },
        select: {
          createdAt: true,
          totalAmount: true,
        },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.order.groupBy({
        by: ['status'],
        where: { createdAt: { gte: startDate, lte: endDate } },
        _count: { id: true },
      }),
    ]);

    const ordersByStatusMap: Record<string, number> = {};
    ordersByStatus.forEach((row) => {
      ordersByStatusMap[row.status] = row._count.id;
    });

    // Group by date (period data for charts and summary)
    const groupedData = new Map<string, { totalSales: number; orderCount: number }>();
    orders.forEach((order) => {
      const dateKey = this.getDateKey(order.createdAt, query.groupBy);
      const existing = groupedData.get(dateKey) || { totalSales: 0, orderCount: 0 };
      groupedData.set(dateKey, {
        totalSales: existing.totalSales + Number(order.totalAmount),
        orderCount: existing.orderCount + 1,
      });
    });

    const result = Array.from(groupedData.entries()).map(([date, data]) => ({
      date,
      totalSales: Math.round(data.totalSales * 100) / 100,
      orderCount: data.orderCount,
      averageOrderValue: data.orderCount > 0
        ? Math.round((data.totalSales / data.orderCount) * 100) / 100
        : 0,
    }));

    const periodTotalSales = result.reduce((sum, r) => sum + r.totalSales, 0);
    const periodTotalOrders = result.reduce((sum, r) => sum + r.orderCount, 0);
    const periodAvgOrderValue = periodTotalOrders > 0
      ? Math.round((periodTotalSales / periodTotalOrders) * 100) / 100
      : 0;

    return {
      data: result,
      summary: {
        totalSales: periodTotalSales,
        totalOrders: periodTotalOrders,
        averageOrderValue: periodAvgOrderValue,
        ordersByStatus: ordersByStatusMap,
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
      },
    };
  }

  /**
   * Get revenue analytics with date range
   * Requirement: GET /admin/analytics/revenue (7.2)
   */
  async getRevenueAnalytics(query: AnalyticsQueryDto) {
    const endDateRaw = query.endDate ? new Date(query.endDate) : new Date();
    const endDate = new Date(endDateRaw);
    endDate.setHours(23, 59, 59, 999);
    const startDate = query.startDate
      ? new Date(query.startDate)
      : new Date(endDate.getTime() - 30 * 24 * 60 * 60 * 1000);
    startDate.setHours(0, 0, 0, 0);

    const completedStatuses: OrderStatus[] = [OrderStatus.completed, OrderStatus.delivered, OrderStatus.paid];
    const orders = await this.prisma.order.findMany({
      where: {
        createdAt: { gte: startDate, lte: endDate },
      },
      select: {
        createdAt: true,
        totalAmount: true,
        commissionAmount: true,
        status: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    // Group by date
    const groupedData = new Map<string, { gross: number; commission: number; refunded: number }>();
    orders.forEach((order) => {
      const dateKey = this.getDateKey(order.createdAt, query.groupBy);
      const existing = groupedData.get(dateKey) || { gross: 0, commission: 0, refunded: 0 };
      const isRefunded = order.status === OrderStatus.refunded;
      const isCompleted = completedStatuses.includes(order.status);
      groupedData.set(dateKey, {
        gross: existing.gross + (isCompleted ? Number(order.totalAmount) : 0),
        commission: existing.commission + (isCompleted ? Number(order.commissionAmount) : 0),
        refunded: existing.refunded + (isRefunded ? Number(order.totalAmount) : 0),
      });
    });

    const result = Array.from(groupedData.entries()).map(([date, data]) => ({
      date,
      grossRevenue: Math.round(data.gross * 100) / 100,
      commissionRevenue: Math.round(data.commission * 100) / 100,
      netRevenue: Math.round((data.gross - data.refunded) * 100) / 100,
    }));

    const periodCommission = result.reduce((sum, r) => sum + r.commissionRevenue, 0);

    return {
      data: result,
      summary: {
        totalGrossRevenue: result.reduce((sum, r) => sum + r.grossRevenue, 0),
        totalCommission: periodCommission,
        totalNetRevenue: result.reduce((sum, r) => sum + r.netRevenue, 0),
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
      },
    };
  }

  /**
   * Get user analytics with date range
   * Requirement: GET /admin/analytics/users (7.2)
   */
  async getUserAnalytics(query: AnalyticsQueryDto) {
    const endDateRaw = query.endDate ? new Date(query.endDate) : new Date();
    const endDate = new Date(endDateRaw);
    endDate.setHours(23, 59, 59, 999);
    const startDate = query.startDate
      ? new Date(query.startDate)
      : new Date(endDate.getTime() - 30 * 24 * 60 * 60 * 1000);
    startDate.setHours(0, 0, 0, 0);

    const [users, totalUsers, totalSellers] = await Promise.all([
      this.prisma.user.findMany({
        where: {
          createdAt: { gte: startDate, lte: endDate },
        },
        select: {
          createdAt: true,
          isSeller: true,
        },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.user.count(),
      this.prisma.user.count({ where: { isSeller: true } }),
    ]);

    // Get active users (those who placed orders or listed products in the period)
    const [activeOrderUsers, activeSellerUsers] = await Promise.all([
      this.prisma.order.findMany({
        where: { createdAt: { gte: startDate, lte: endDate } },
        select: { buyerId: true, createdAt: true },
        distinct: ['buyerId'],
      }),
      this.prisma.product.findMany({
        where: { createdAt: { gte: startDate, lte: endDate } },
        select: { sellerId: true, createdAt: true },
        distinct: ['sellerId'],
      }),
    ]);

    // Group new users by date
    const groupedData = new Map<string, { newUsers: number; newSellers: number; activeUsers: Set<string> }>();

    users.forEach((user) => {
      const dateKey = this.getDateKey(user.createdAt, query.groupBy);
      const existing = groupedData.get(dateKey) || { newUsers: 0, newSellers: 0, activeUsers: new Set() };
      groupedData.set(dateKey, {
        newUsers: existing.newUsers + 1,
        newSellers: existing.newSellers + (user.isSeller ? 1 : 0),
        activeUsers: existing.activeUsers,
      });
    });

    // Add active users to their respective date groups
    [...activeOrderUsers, ...activeSellerUsers].forEach((item) => {
      const dateKey = this.getDateKey(item.createdAt, query.groupBy);
      const existing = groupedData.get(dateKey);
      if (existing) {
        const userId = 'buyerId' in item ? item.buyerId : item.sellerId;
        existing.activeUsers.add(userId);
      }
    });

    const result = Array.from(groupedData.entries()).map(([date, data]) => ({
      date,
      newUsers: data.newUsers,
      activeUsers: data.activeUsers.size,
      newSellers: data.newSellers,
    }));

    return {
      data: result,
      summary: {
        totalUsers,
        totalNewUsers: result.reduce((sum, r) => sum + r.newUsers, 0),
        totalNewSellers: result.reduce((sum, r) => sum + r.newSellers, 0),
        totalSellers,
        averageDailyActiveUsers: result.length > 0
          ? Math.round(result.reduce((sum, r) => sum + r.activeUsers, 0) / result.length)
          : 0,
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
      },
    };
  }

  /**
   * Helper to get date key based on grouping
   */
  private getDateKey(date: Date, groupBy?: AnalyticsGroupBy): string {
    const d = new Date(date);
    switch (groupBy) {
      case AnalyticsGroupBy.week:
        // Get Monday of the week
        const day = d.getDay();
        const diff = d.getDate() - day + (day === 0 ? -6 : 1);
        const monday = new Date(d.setDate(diff));
        return monday.toISOString().split('T')[0];
      case AnalyticsGroupBy.month:
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      case AnalyticsGroupBy.day:
      default:
        return d.toISOString().split('T')[0];
    }
  }

  /**
   * Get single order by ID
   * Requirement: GET /admin/orders/:id (7.2)
   */
  async getOrderById(orderId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        buyer: {
          select: {
            id: true,
            displayName: true,
            email: true,
            phone: true,
            isVerified: true,
          }
        },
        seller: {
          select: {
            id: true,
            displayName: true,
            email: true,
            phone: true,
            isVerified: true,
            sellerType: true,
          }
        },
        product: {
          include: {
            images: { orderBy: { sortOrder: 'asc' } },
            category: { select: { id: true, name: true } },
          }
        },
        offer: true,
        payment: true,
        shipment: {
          include: {
            events: { orderBy: { occurredAt: 'desc' } },
          },
        },
      },
    });

    if (!order) {
      throw new NotFoundException('Sipariş bulunamadı');
    }

    const totalAmount = Number(order.totalAmount);
    const shippingCost = Number(order.shippingCost);
    const commissionAmount = Number(order.commissionAmount);
    const buyerFeeAmount = Number(order.buyerFeeAmount ?? 0);
    const sellerFeeAmount = Number(order.sellerFeeAmount ?? 0);
    const subtotal = order.subtotal != null ? Number(order.subtotal) : totalAmount - shippingCost - buyerFeeAmount;
    const sellerNetAmount = subtotal - sellerFeeAmount;

    return {
      ...order,
      totalAmount,
      commissionAmount,
      shippingCost,
      buyerFeeAmount,
      sellerFeeAmount,
      subtotal,
      sellerNetAmount,
      pricing: {
        subtotal,
        shippingAmount: shippingCost,
        buyerFeeAmount,
        sellerFeeAmount,
        commissionAmount,
        totalAmount,
        sellerNetAmount,
      },
      product: {
        ...order.product,
        price: Number(order.product.price),
        images: (order.product.images || []).map((img: any) => ({
          ...img,
          url: this.resolveProductImageUrl(img.cardKey) || this.resolveProductImageUrl(img.url) || img.url,
        })),
      },
      offer: order.offer ? {
        ...order.offer,
        amount: Number(order.offer.amount),
      } : null,
      payment: order.payment ? {
        ...order.payment,
        amount: Number(order.payment.amount),
      } : null,
    };
  }

  /**
   * Update order status
   * Requirement: PATCH /admin/orders/:id (7.2)
   */
  async updateOrderStatus(adminId: string, orderId: string, dto: UpdateOrderStatusDto) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        product: true,
      },
    });

    if (!order) {
      throw new NotFoundException('Sipariş bulunamadı');
    }

    // Validate status transition
    const validStatuses = Object.values(OrderStatus);
    if (!validStatuses.includes(dto.status as OrderStatus)) {
      throw new BadRequestException('Geçersiz sipariş durumu');
    }

    // If order is being marked as completed, update product status based on remaining quantity
    if (dto.status === OrderStatus.completed && order.productId) {
      const product = await this.prisma.product.findUnique({
        where: { id: order.productId },
      });

      if (product) {
        const newStatus = getProductStatusFromQuantity(product.quantity);
        await this.prisma.product.update({
          where: { id: order.productId },
          data: { status: newStatus },
        });

        // Invalidate cache
        await this.cache.del(`products:detail:${order.productId}`);
        await this.cache.delPattern('products:list:*');
      }
    }

    const updated = await this.prisma.order.update({
      where: { id: orderId },
      data: {
        status: dto.status as OrderStatus,
        version: { increment: 1 },
      },
    });

    await this.createAuditLog(adminId, 'order_status_update', 'Order', orderId, order, {
      ...updated,
      notes: dto.notes,
    });

    return {
      success: true,
      orderId,
      previousStatus: order.status,
      newStatus: dto.status,
      notes: dto.notes,
    };
  }

  /**
   * Add tracking information to order
   */
  async addOrderTracking(
    adminId: string,
    orderId: string,
    dto: { trackingNumber: string; carrier: string; trackingUrl?: string },
  ) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { shipment: true },
    });

    if (!order) {
      throw new NotFoundException('Sipariş bulunamadı');
    }

    // Update or create shipment
    let shipment;
    if (order.shipment) {
      shipment = await this.prisma.shipment.update({
        where: { id: order.shipment.id },
        data: {
          trackingNumber: dto.trackingNumber,
          provider: dto.carrier,
          trackingUrl: dto.trackingUrl,
          status: 'in_transit',
        },
      });
    } else {
      shipment = await this.prisma.shipment.create({
        data: {
          orderId,
          trackingNumber: dto.trackingNumber,
          provider: dto.carrier,
          trackingUrl: dto.trackingUrl,
          status: 'in_transit',
        },
      });
    }

    // Update order status to shipped
    await this.prisma.order.update({
      where: { id: orderId },
      data: { status: OrderStatus.shipped },
    });

    await this.createAuditLog(adminId, 'order_tracking_added', 'Order', orderId, order, {
      trackingNumber: dto.trackingNumber,
      carrier: dto.carrier,
    });

    return { success: true, shipment };
  }

  /**
   * Send notification about order to buyer/seller
   */
  async sendOrderNotification(
    adminId: string,
    orderId: string,
    dto: { type: 'status_update' | 'shipped' | 'delivered' | 'custom'; message?: string },
  ) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        buyer: { select: { id: true, email: true, displayName: true } },
        seller: { select: { id: true, email: true, displayName: true } },
        product: { select: { title: true } },
      },
    });

    if (!order) {
      throw new NotFoundException('Sipariş bulunamadı');
    }

    const statusLabels: Record<string, string> = {
      pending_payment: 'Ödeme Bekleniyor',
      paid: 'Ödendi',
      preparing: 'Hazırlanıyor',
      shipped: 'Kargoya Verildi',
      delivered: 'Teslim Edildi',
      completed: 'Tamamlandı',
      cancelled: 'İptal Edildi',
    };

    let title = '';
    let body = '';

    switch (dto.type) {
      case 'status_update':
        title = 'Sipariş Durumu Güncellendi';
        body = `#${order.orderNumber} numaralı siparişinizin durumu "${statusLabels[order.status] || order.status}" olarak güncellendi.`;
        break;
      case 'shipped':
        title = 'Siparişiniz Kargoda';
        body = `#${order.orderNumber} numaralı siparişiniz kargoya verildi.`;
        break;
      case 'delivered':
        title = 'Siparişiniz Teslim Edildi';
        body = `#${order.orderNumber} numaralı siparişiniz teslim edildi.`;
        break;
      case 'custom':
        title = 'Sipariş Bildirimi';
        body = dto.message || 'Siparişinizle ilgili bir güncelleme var.';
        break;
    }

    // Create notification for buyer
    await this.prisma.notificationLog.create({
      data: {
        userId: order.buyerId,
        channel: 'system',
        type: 'order',
        title,
        body: body,
        data: { orderId, orderNumber: order.orderNumber },
        status: 'sent',
      },
    });

    await this.createAuditLog(adminId, 'order_notification_sent', 'Order', orderId, null, {
      type: dto.type,
      buyerId: order.buyerId,
    });

    return { success: true, message: 'Bildirim gönderildi' };
  }

  /**
   * Generate invoice data for order
   */
  async generateOrderInvoice(orderId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        buyer: { select: { id: true, email: true, displayName: true, phone: true } },
        seller: { select: { id: true, email: true, displayName: true } },
        product: { select: { id: true, title: true, price: true } },
        payment: true,
        shipment: true,
      },
    });

    if (!order) {
      throw new NotFoundException('Sipariş bulunamadı');
    }

    const shippingAddress = order.shippingAddress as any;

    return {
      invoiceNumber: `INV-${order.orderNumber}`,
      orderNumber: order.orderNumber,
      orderDate: order.createdAt,
      status: order.status,
      buyer: {
        name: shippingAddress?.fullName || order.buyer.displayName,
        email: order.buyer.email,
        phone: shippingAddress?.phone || order.buyer.phone,
        address: shippingAddress ? `${shippingAddress.address}, ${shippingAddress.district}, ${shippingAddress.city} ${shippingAddress.postalCode || ''}` : null,
      },
      seller: {
        name: order.seller.displayName,
        email: order.seller.email,
      },
      items: [{
        title: order.product.title,
        quantity: 1,
        unitPrice: Number(order.product.price),
        total: Number(order.totalAmount) - Number(order.shippingCost || 0),
      }],
      subtotal: Number(order.totalAmount) - Number(order.shippingCost || 0),
      shippingCost: Number(order.shippingCost || 0),
      total: Number(order.totalAmount),
      payment: order.payment ? {
        status: order.payment.status,
        provider: order.payment.provider,
      } : null,
      shipment: order.shipment ? {
        trackingNumber: order.shipment.trackingNumber,
        carrier: order.shipment.provider,
      } : null,
    };
  }

  /**
   * Unban user
   * Requirement: POST /admin/users/:id/unban (7.2)
   * - Sets isBanned = false
   * - Clears bannedAt, bannedReason, bannedBy
   * - Does NOT automatically reactivate products (manual approval required)
   */
  async unbanUser(adminId: string, userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('Kullanıcı bulunamadı');
    }

    if (!(user as any).isBanned) {
      throw new BadRequestException('Kullanıcı zaten banlı değil');
    }

    return this.prisma.$transaction(async (tx) => {
      // 1. User'ı unban yap
      const updatedUser = await tx.user.update({
        where: { id: userId },
        data: {
          isBanned: false,
          bannedAt: null,
          bannedReason: null,
          bannedBy: null,
        } as any,
      });

      // 2. Audit log oluştur
      await this.createAuditLog(adminId, 'user_unban', 'User', userId, user, updatedUser);

      this.logger.log(`User ${userId} unbanned by admin ${adminId}`);

      return { success: true, userId };
    });
  }

  /**
   * Get recent orders for dashboard
   * Requirement: Recent Orders Panel (7.1)
   */
  async getRecentOrders(limit: number = 10) {
    const orders = await this.prisma.order.findMany({
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        buyer: { select: { id: true, displayName: true } },
        product: { select: { id: true, title: true } },
      },
    });

    return orders.map((o) => ({
      id: o.id,
      orderNumber: o.orderNumber,
      buyerName: o.buyer.displayName,
      productTitle: o.product.title,
      amount: Number(o.totalAmount),
      status: o.status,
      createdAt: o.createdAt,
    }));
  }

  /**
   * Get pending actions for dashboard
   * Requirement: Pending Actions Panel (7.1)
   */
  async getPendingActions() {
    const [
      pendingProducts,
      refundRequests,
      pendingMessages,
    ] = await Promise.all([
      this.prisma.product.count({ where: { status: ProductStatus.pending } }),
      this.prisma.order.count({ where: { status: OrderStatus.refund_requested } }),
      this.prisma.message.count({ where: { status: 'pending_approval' } }),
    ]);

    return {
      pendingProducts,
      refundRequests,
      pendingMessages,
      totalPending: pendingProducts + refundRequests + pendingMessages,
    };
  }

  /**
   * Generate sales report
   * Requirement: GET /admin/reports/sales (7.2)
   */
  async generateSalesReport(query: ReportQueryDto) {
    const endDate = query.endDate ? new Date(query.endDate) : new Date();
    const startDate = query.startDate
      ? new Date(query.startDate)
      : new Date(endDate.getTime() - 30 * 24 * 60 * 60 * 1000);

    const orders = await this.prisma.order.findMany({
      where: {
        createdAt: { gte: startDate, lte: endDate },
        status: { in: [OrderStatus.completed, OrderStatus.delivered, OrderStatus.paid] },
      },
      include: {
        buyer: { select: { displayName: true, email: true } },
        seller: { select: { displayName: true, email: true } },
        product: {
          select: {
            title: true,
            category: { select: { name: true } }
          }
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const reportData = orders.map((o) => ({
      orderNumber: o.orderNumber,
      date: o.createdAt.toISOString().split('T')[0],
      buyer: o.buyer.displayName,
      buyerEmail: o.buyer.email,
      seller: o.seller.displayName,
      sellerEmail: o.seller.email,
      product: o.product.title,
      category: o.product.category?.name || 'N/A',
      amount: Number(o.totalAmount),
      commission: Number(o.commissionAmount),
      status: o.status,
    }));

    const summary = {
      totalOrders: reportData.length,
      totalSales: reportData.reduce((sum, r) => sum + r.amount, 0),
      totalCommission: reportData.reduce((sum, r) => sum + r.commission, 0),
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      generatedAt: new Date().toISOString(),
    };

    // For CSV format
    if (query.format === 'csv') {
      const headers = 'Order Number,Date,Buyer,Buyer Email,Seller,Seller Email,Product,Category,Amount,Commission,Status\n';
      const rows = reportData.map((r) =>
        `${r.orderNumber},${r.date},${r.buyer},${r.buyerEmail},${r.seller},${r.sellerEmail},"${r.product}",${r.category},${r.amount},${r.commission},${r.status}`
      ).join('\n');
      return { format: 'csv', content: headers + rows, summary };
    }

    // For PDF, return structured data (actual PDF generation would require a library like pdfkit)
    if (query.format === 'pdf') {
      return {
        format: 'pdf',
        data: reportData,
        summary,
        message: 'PDF generation requires frontend implementation with the provided data',
      };
    }

    // Default JSON format
    return { format: 'json', data: reportData, summary };
  }

  /**
   * Generate users report (CSV/PDF/JSON)
   * GET /admin/reports/users
   */
  async generateUsersReport(query: ReportQueryDto) {
    const endDate = query.endDate ? new Date(query.endDate) : new Date();
    const startDate = query.startDate
      ? new Date(query.startDate)
      : new Date(endDate.getTime() - 30 * 24 * 60 * 60 * 1000);

    const users = await this.prisma.user.findMany({
      where: { createdAt: { gte: startDate, lte: endDate } },
      select: {
        id: true,
        email: true,
        displayName: true,
        phone: true,
        isSeller: true,
        sellerType: true,
        isVerified: true,
        isBanned: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    const reportData = users.map((u) => ({
      id: u.id,
      email: u.email,
      displayName: u.displayName ?? '',
      phone: u.phone ?? '',
      isSeller: u.isSeller,
      sellerType: u.sellerType ?? '',
      isVerified: u.isVerified,
      isBanned: (u as any).isBanned ?? false,
      createdAt: u.createdAt.toISOString().split('T')[0],
    }));

    const [totalUsers, newInPeriod] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.user.count({ where: { createdAt: { gte: startDate, lte: endDate } } }),
    ]);

    const summary = {
      totalUsers,
      newInPeriod: reportData.length,
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      generatedAt: new Date().toISOString(),
    };

    if (query.format === 'csv') {
      const headers = 'Id,Email,Display Name,Phone,Is Seller,Seller Type,Verified,Banned,Created At\n';
      const rows = reportData
        .map(
          (r) =>
            `${r.id},${r.email},"${(r.displayName || '').replace(/"/g, '""')}",${r.phone || ''},${r.isSeller},${r.sellerType},${r.isVerified},${r.isBanned},${r.createdAt}`,
        )
        .join('\n');
      return { format: 'csv', content: headers + rows, summary };
    }

    if (query.format === 'pdf') {
      return {
        format: 'pdf',
        data: reportData,
        summary,
        message: 'PDF generation requires frontend implementation with the provided data',
      };
    }

    return { format: 'json', data: reportData, summary };
  }

  /**
   * Generate products report (CSV/PDF/JSON)
   * GET /admin/reports/products - also used by analytics dashboard (summary + categoryDistribution)
   */
  async generateProductsReport(query: ReportQueryDto) {
    const endDate = query.endDate ? new Date(query.endDate) : new Date();
    const startDate = query.startDate
      ? new Date(query.startDate)
      : new Date(endDate.getTime() - 30 * 24 * 60 * 60 * 1000);

    const [products, total, active, pending, byCategory, avgPrice] = await Promise.all([
      this.prisma.product.findMany({
        where: { createdAt: { gte: startDate, lte: endDate } },
        include: {
          seller: { select: { id: true, displayName: true, email: true } },
          category: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.product.count(),
      this.prisma.product.count({ where: { status: ProductStatus.active } }),
      this.prisma.product.count({ where: { status: ProductStatus.pending } }),
      this.prisma.product.groupBy({
        by: ['categoryId'],
        where: { createdAt: { gte: startDate, lte: endDate } },
        _count: { id: true },
      }),
      this.prisma.product.aggregate({
        where: { createdAt: { gte: startDate, lte: endDate }, status: ProductStatus.active },
        _avg: { price: true },
      }),
    ]);

    const categoryIds = [...new Set(byCategory.map((c) => c.categoryId).filter(Boolean))] as string[];
    const categories = await this.prisma.category.findMany({
      where: { id: { in: categoryIds } },
      select: { id: true, name: true },
    });
    const categoryMap = new Map(categories.map((c) => [c.id, c.name]));
    const totalInPeriod = byCategory.reduce((sum, c) => sum + c._count.id, 0);
    const categoryDistribution = byCategory
      .map((c) => {
        const name = c.categoryId ? categoryMap.get(c.categoryId) || 'Kategorisiz' : 'Kategorisiz';
        const count = c._count.id;
        const percentage = totalInPeriod > 0 ? Math.round((count / totalInPeriod) * 1000) / 10 : 0;
        return { name, count, percentage };
      })
      .sort((a, b) => b.count - a.count);

    const reportData = products.map((p) => ({
      id: p.id,
      title: p.title,
      price: Number(p.price),
      status: p.status,
      category: p.category?.name ?? 'N/A',
      sellerName: p.seller?.displayName ?? '',
      sellerEmail: p.seller?.email ?? '',
      createdAt: p.createdAt.toISOString().split('T')[0],
    }));

    const summary = {
      totalProducts: total,
      activeProducts: active,
      pendingProducts: pending,
      averagePrice: Number(avgPrice._avg.price || 0),
      categoryDistribution,
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      generatedAt: new Date().toISOString(),
    };

    if (query.format === 'csv') {
      const headers = 'Id,Title,Price,Status,Category,Seller Name,Seller Email,Created At\n';
      const rows = reportData
        .map(
          (r) =>
            `${r.id},"${(r.title || '').replace(/"/g, '""')}",${r.price},${r.status},${r.category},"${(r.sellerName || '').replace(/"/g, '""')}",${r.sellerEmail},${r.createdAt}`,
        )
        .join('\n');
      return { format: 'csv', content: headers + rows, summary };
    }

    if (query.format === 'pdf') {
      return {
        format: 'pdf',
        data: reportData,
        summary,
        message: 'PDF generation requires frontend implementation with the provided data',
      };
    }

    // JSON: top-level summary fields for analytics dashboard + data for export
    return {
      format: 'json',
      data: reportData,
      summary,
      totalProducts: total,
      activeProducts: active,
      pendingProducts: pending,
      averagePrice: Number(avgPrice._avg.price || 0),
      categoryDistribution,
    };
  }

  /**
   * Generate trades report (CSV/PDF/JSON)
   * GET /admin/reports/trades - also used by analytics dashboard
   */
  async generateTradesReport(query: ReportQueryDto) {
    const endDate = query.endDate ? new Date(query.endDate) : new Date();
    const startDate = query.startDate
      ? new Date(query.startDate)
      : new Date(endDate.getTime() - 30 * 24 * 60 * 60 * 1000);

    const trades = await this.prisma.trade.findMany({
      where: { createdAt: { gte: startDate, lte: endDate } },
      include: {
        initiator: { select: { id: true, displayName: true, email: true } },
        receiver: { select: { id: true, displayName: true, email: true } },
        items: { include: { product: { select: { title: true, price: true } } } },
      },
      orderBy: { createdAt: 'desc' },
    });

    const [totalTrades, completedTrades, pendingTrades, disputedTrades] = await Promise.all([
      this.prisma.trade.count(),
      this.prisma.trade.count({ where: { status: TradeStatus.completed } }),
      this.prisma.trade.count({
        where: { status: { in: [TradeStatus.pending, TradeStatus.accepted] } },
      }),
      this.prisma.trade.count({
        where: { dispute: { isNot: null } },
      }),
    ]);

    const reportData = trades.map((t) => ({
      id: t.id,
      status: t.status,
      initiatorName: t.initiator?.displayName ?? '',
      initiatorEmail: t.initiator?.email ?? '',
      receiverName: t.receiver?.displayName ?? '',
      receiverEmail: t.receiver?.email ?? '',
      createdAt: t.createdAt.toISOString().split('T')[0],
      completedAt: t.completedAt?.toISOString().split('T')[0] ?? '',
    }));

    const summary = {
      totalTrades,
      completedTrades,
      pendingTrades,
      disputedTrades,
      averageTradeValue: 0,
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      generatedAt: new Date().toISOString(),
    };

    if (query.format === 'csv') {
      const headers = 'Id,Status,Initiator Name,Initiator Email,Receiver Name,Receiver Email,Created At,Completed At\n';
      const rows = reportData
        .map(
          (r) =>
            `${r.id},${r.status},${r.initiatorName},${r.initiatorEmail},${r.receiverName},${r.receiverEmail},${r.createdAt},${r.completedAt}`,
        )
        .join('\n');
      return { format: 'csv', content: headers + rows, summary };
    }

    if (query.format === 'pdf') {
      return {
        format: 'pdf',
        data: reportData,
        summary,
        message: 'PDF generation requires frontend implementation with the provided data',
      };
    }

    // JSON: top-level summary fields for analytics dashboard + data for export
    return {
      format: 'json',
      data: reportData,
      summary,
      totalTrades: summary.totalTrades,
      completedTrades: summary.completedTrades,
      pendingTrades: summary.pendingTrades,
      disputedTrades: summary.disputedTrades,
      averageTradeValue: summary.averageTradeValue,
    };
  }

  /**
   * Get commission report
   * Requirement: GET /admin/reports/commission (7.2)
   */
  async getCommissionReport(query: ReportQueryDto) {
    const endDate = query.endDate ? new Date(query.endDate) : new Date();
    const startDate = query.startDate
      ? new Date(query.startDate)
      : new Date(endDate.getTime() - 30 * 24 * 60 * 60 * 1000);

    // Get orders with commission
    const orders = await this.prisma.order.findMany({
      where: {
        createdAt: { gte: startDate, lte: endDate },
        status: { in: [OrderStatus.completed, OrderStatus.delivered] },
      },
      include: {
        seller: {
          select: {
            id: true,
            displayName: true,
            sellerType: true,
          }
        },
        product: {
          select: {
            category: { select: { id: true, name: true } }
          }
        },
      },
    });

    // Group by seller
    const sellerCommissions = new Map<string, {
      sellerId: string;
      sellerName: string;
      sellerType: string | null;
      orderCount: number;
      totalSales: number;
      totalCommission: number;
    }>();

    orders.forEach((order) => {
      const key = order.sellerId;
      const existing = sellerCommissions.get(key) || {
        sellerId: order.sellerId,
        sellerName: order.seller.displayName,
        sellerType: order.seller.sellerType,
        orderCount: 0,
        totalSales: 0,
        totalCommission: 0,
      };
      sellerCommissions.set(key, {
        ...existing,
        orderCount: existing.orderCount + 1,
        totalSales: existing.totalSales + Number(order.totalAmount),
        totalCommission: existing.totalCommission + Number(order.commissionAmount),
      });
    });

    // Group by category
    const categoryCommissions = new Map<string, {
      categoryId: string;
      categoryName: string;
      orderCount: number;
      totalSales: number;
      totalCommission: number;
    }>();

    orders.forEach((order) => {
      const categoryId = order.product.category?.id || 'uncategorized';
      const categoryName = order.product.category?.name || 'Kategorisiz';
      const existing = categoryCommissions.get(categoryId) || {
        categoryId,
        categoryName,
        orderCount: 0,
        totalSales: 0,
        totalCommission: 0,
      };
      categoryCommissions.set(categoryId, {
        ...existing,
        orderCount: existing.orderCount + 1,
        totalSales: existing.totalSales + Number(order.totalAmount),
        totalCommission: existing.totalCommission + Number(order.commissionAmount),
      });
    });

    const summary = {
      totalOrders: orders.length,
      totalSales: orders.reduce((sum, o) => sum + Number(o.totalAmount), 0),
      totalCommission: orders.reduce((sum, o) => sum + Number(o.commissionAmount), 0),
      averageCommissionRate: orders.length > 0
        ? Math.round((orders.reduce((sum, o) => sum + Number(o.commissionAmount), 0) /
          orders.reduce((sum, o) => sum + Number(o.totalAmount), 0)) * 10000) / 100
        : 0,
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
    };

    return {
      bySeller: Array.from(sellerCommissions.values())
        .sort((a, b) => b.totalCommission - a.totalCommission),
      byCategory: Array.from(categoryCommissions.values())
        .sort((a, b) => b.totalCommission - a.totalCommission),
      summary,
    };
  }

  /**
   * Get commission revenue summary
   * Requirement: GET /admin/commission/revenue (project.txt)
   */
  async getCommissionRevenue(query: AnalyticsQueryDto) {
    const endDate = query.endDate ? new Date(query.endDate) : new Date();
    const startDate = query.startDate
      ? new Date(query.startDate)
      : new Date(endDate.getTime() - 30 * 24 * 60 * 60 * 1000);

    const [totalCommission, commissionByMonth, commissionByCategory] = await Promise.all([
      // Total commission in period
      this.prisma.order.aggregate({
        _sum: { commissionAmount: true },
        where: {
          createdAt: { gte: startDate, lte: endDate },
          status: { in: [OrderStatus.completed, OrderStatus.delivered] },
        },
      }),
      // Commission grouped by month
      this.prisma.$queryRaw`
        SELECT 
          DATE_TRUNC('month', created_at) as month,
          SUM(commission_amount) as total
        FROM orders
        WHERE created_at >= ${startDate} 
          AND created_at <= ${endDate}
          AND status IN ('completed', 'delivered')
        GROUP BY DATE_TRUNC('month', created_at)
        ORDER BY month DESC
      ` as Promise<Array<{ month: Date; total: number }>>,
      // Commission by category
      this.prisma.order.findMany({
        where: {
          createdAt: { gte: startDate, lte: endDate },
          status: { in: [OrderStatus.completed, OrderStatus.delivered] },
        },
        include: {
          product: {
            select: {
              category: { select: { id: true, name: true } },
            },
          },
        },
      }),
    ]);

    // Group commission by category
    const categoryMap = new Map<string, { name: string; commission: number; count: number }>();
    commissionByCategory.forEach((order) => {
      const catId = order.product.category?.id || 'uncategorized';
      const catName = order.product.category?.name || 'Kategorisiz';
      const existing = categoryMap.get(catId) || { name: catName, commission: 0, count: 0 };
      categoryMap.set(catId, {
        name: catName,
        commission: existing.commission + Number(order.commissionAmount),
        count: existing.count + 1,
      });
    });

    return {
      totalCommission: Number(totalCommission._sum.commissionAmount || 0),
      byMonth: commissionByMonth.map((m) => ({
        month: m.month,
        total: Number(m.total || 0),
      })),
      byCategory: Array.from(categoryMap.entries()).map(([id, data]) => ({
        categoryId: id,
        categoryName: data.name,
        commission: Math.round(data.commission * 100) / 100,
        orderCount: data.count,
      })).sort((a, b) => b.commission - a.commission),
      period: {
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
      },
    };
  }

  /**
   * Generate custom report with flexible parameters
   * Requirement: GET /admin/reports/custom (project.txt)
   */
  async generateCustomReport(query: ReportQueryDto) {
    const endDate = query.endDate ? new Date(query.endDate) : new Date();
    const startDate = query.startDate
      ? new Date(query.startDate)
      : new Date(endDate.getTime() - 30 * 24 * 60 * 60 * 1000);

    // Get comprehensive stats for the period
    const [
      orderStats,
      userStats,
      productStats,
      topSellers,
      topCategories,
    ] = await Promise.all([
      // Order statistics
      this.prisma.order.aggregate({
        _count: true,
        _sum: { totalAmount: true, commissionAmount: true },
        where: {
          createdAt: { gte: startDate, lte: endDate },
          status: { in: [OrderStatus.completed, OrderStatus.delivered, OrderStatus.paid] },
        },
      }),
      // User statistics
      this.prisma.user.aggregate({
        _count: true,
        where: { createdAt: { gte: startDate, lte: endDate } },
      }),
      // Product statistics
      this.prisma.product.aggregate({
        _count: true,
        where: { createdAt: { gte: startDate, lte: endDate } },
      }),
      // Top sellers by revenue
      this.prisma.order.groupBy({
        by: ['sellerId'],
        _sum: { totalAmount: true },
        _count: true,
        where: {
          createdAt: { gte: startDate, lte: endDate },
          status: { in: [OrderStatus.completed, OrderStatus.delivered] },
        },
        orderBy: { _sum: { totalAmount: 'desc' } },
        take: 10,
      }),
      // Top categories
      this.prisma.order.findMany({
        where: {
          createdAt: { gte: startDate, lte: endDate },
          status: { in: [OrderStatus.completed, OrderStatus.delivered] },
        },
        include: {
          product: {
            select: { category: { select: { id: true, name: true } } },
          },
        },
      }),
    ]);

    // Process top sellers to get names
    const sellerIds = topSellers.map((s) => s.sellerId);
    const sellers = await this.prisma.user.findMany({
      where: { id: { in: sellerIds } },
      select: { id: true, displayName: true },
    });
    const sellerMap = new Map(sellers.map((s) => [s.id, s.displayName]));

    // Group by category
    const categoryRevenue = new Map<string, { name: string; revenue: number; count: number }>();
    topCategories.forEach((order) => {
      const catId = order.product.category?.id || 'uncategorized';
      const catName = order.product.category?.name || 'Kategorisiz';
      const existing = categoryRevenue.get(catId) || { name: catName, revenue: 0, count: 0 };
      categoryRevenue.set(catId, {
        name: catName,
        revenue: existing.revenue + Number(order.totalAmount),
        count: existing.count + 1,
      });
    });

    return {
      period: {
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
      },
      summary: {
        totalOrders: orderStats._count,
        totalRevenue: Number(orderStats._sum.totalAmount || 0),
        totalCommission: Number(orderStats._sum.commissionAmount || 0),
        newUsers: userStats._count,
        newProducts: productStats._count,
      },
      topSellers: topSellers.map((s) => ({
        sellerId: s.sellerId,
        sellerName: sellerMap.get(s.sellerId) || 'Unknown',
        revenue: Number(s._sum.totalAmount || 0),
        orderCount: s._count,
      })),
      topCategories: Array.from(categoryRevenue.entries())
        .map(([id, data]) => ({
          categoryId: id,
          categoryName: data.name,
          revenue: Math.round(data.revenue * 100) / 100,
          orderCount: data.count,
        }))
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 10),
      generatedAt: new Date().toISOString(),
    };
  }

  // ==================== AUDIT LOGS ====================

  /**
   * Get audit logs
   */
  async getAuditLogs(query: AuditLogQueryDto) {
    const { action, adminId, fromDate, toDate, page = 1, limit = 50 } = query;

    const where: Prisma.AuditLogWhereInput = {};

    if (action) {
      where.action = action;
    }

    if (adminId) {
      where.adminUserId = adminId;
    }

    if (fromDate || toDate) {
      where.createdAt = {};
      if (fromDate) {
        where.createdAt.gte = new Date(fromDate);
      }
      if (toDate) {
        where.createdAt.lte = new Date(toDate);
      }
    }

    const [total, logs] = await Promise.all([
      this.prisma.auditLog.count({ where }),
      this.prisma.auditLog.findMany({
        where,
        include: {
          adminUser: { select: { id: true, user: { select: { email: true } } } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return {
      data: logs.map((log) => ({
        ...log,
        admin: log.adminUser
          ? { id: log.adminUser.id, email: log.adminUser.user.email }
          : null,
      })),
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  /**
   * Create audit log entry
   */
  private async createAuditLog(
    adminUserId: string,
    action: string,
    entityType: string,
    entityId: string,
    oldValue: any,
    newValue: any,
  ) {
    try {
      // Resolve adminUserId: @CurrentUser('id') returns User.id, but AuditLog expects AdminUser.id
      const adminUser = await this.prisma.adminUser.findFirst({
        where: { userId: adminUserId, isActive: true },
        select: { id: true },
      });
      if (!adminUser) {
        this.logger.warn(`Admin user not found for userId ${adminUserId}, skipping audit log`);
        return Promise.resolve();
      }
      const resolvedAdminUserId = adminUser.id;

      // Serialize values to ensure they can be stored as JSON
      const serializeValue = (value: any) => {
        if (value === null || value === undefined) {
          return null;
        }
        try {
          // Use JSON.parse/stringify to handle Date, Decimal, etc.
          return JSON.parse(JSON.stringify(value, (key, val) => {
            // Convert Date to ISO string
            if (val instanceof Date) {
              return val.toISOString();
            }
            // Convert Decimal to number (Prisma Decimal has toNumber method)
            if (val && typeof val === 'object' && typeof val.toNumber === 'function') {
              return val.toNumber();
            }
            return val;
          }));
        } catch (e) {
          // Fallback: convert to string if serialization fails
          this.logger.warn(`Failed to serialize audit log value for ${entityType}:${entityId}`, e);
          return String(value);
        }
      };

      return await this.prisma.auditLog.create({
        data: {
          adminUserId: resolvedAdminUserId,
          action,
          entityType,
          entityId,
          oldValue: serializeValue(oldValue),
          newValue: serializeValue(newValue),
        },
      });
    } catch (error) {
      // Log error but don't fail the main operation
      this.logger.error(`Failed to create audit log for ${entityType}:${entityId}`, error);
      // Return a promise that resolves to avoid breaking the caller
      return Promise.resolve();
    }
  }

  // ==================== MODERATION QUEUE ====================

  /**
   * Get moderation queue items
   * Requirement: Content moderation (project.md)
   */
  async getModerationQueue(options: {
    type?: string;
    page: number;
    pageSize: number;
  }) {
    const { type, page, pageSize } = options;
    const skip = (page - 1) * pageSize;

    const items: any[] = [];
    let totalCount = 0;

    // Get pending products if type is 'product' or all
    if (!type || type === 'product') {
      const [products, productCount] = await Promise.all([
        this.prisma.product.findMany({
          where: { status: ProductStatus.pending },
          include: {
            seller: { select: { id: true, displayName: true, email: true } },
            category: { select: { id: true, name: true } },
            images: { take: 1, orderBy: { sortOrder: 'asc' } },
          },
          orderBy: { createdAt: 'asc' },
          skip: type === 'product' ? skip : 0,
          take: type === 'product' ? pageSize : 10,
        }),
        this.prisma.product.count({ where: { status: ProductStatus.pending } }),
      ]);

      items.push(
        ...products.map((p) => ({
          id: p.id,
          type: 'product',
          title: p.title,
          description: p.description?.substring(0, 200) || '',
          imageUrl: this.resolveProductImageUrl(p.images[0]?.cardKey) || null,
          price: Number(p.price),
          seller: p.seller,
          category: p.category?.name || 'Kategorisiz',
          createdAt: p.createdAt,
          status: 'pending',
          // AI moderasyon sonuçları (null = henüz denetlenmedi)
          aiCheckStatus: p.aiCheckStatus,
          aiRelevanceScore: p.aiRelevanceScore,
          aiNsfwScore: p.aiNsfwScore,
          aiCheckReason: p.aiCheckReason,
        })),
      );
      totalCount += productCount;
    }

    // Get pending approval messages if type is 'message' or all
    if (!type || type === 'message') {
      const [messages, messageCount] = await Promise.all([
        this.prisma.message.findMany({
          where: { status: 'pending_approval' },
          include: {
            sender: { select: { id: true, displayName: true, email: true } },
            thread: { select: { id: true } },
          },
          orderBy: { createdAt: 'asc' },
          skip: type === 'message' ? skip : 0,
          take: type === 'message' ? pageSize : 10,
        }),
        this.prisma.message.count({ where: { status: 'pending_approval' } }),
      ]);

      items.push(
        ...messages.map((m) => ({
          id: m.id,
          type: 'message',
          title: `Mesaj #${m.id.substring(0, 8)}`,
          description: m.content?.substring(0, 200) || '',
          sender: m.sender,
          threadId: m.threadId,
          createdAt: m.createdAt,
          status: 'pending_approval',
        })),
      );
      totalCount += messageCount;
    }

    // Get reviews with comments if type is 'review' or all
    if (!type || type === 'review') {
      const [reviews, reviewCount] = await Promise.all([
        this.prisma.rating.findMany({
          where: {
            comment: { not: null },
          },
          include: {
            giver: { select: { id: true, displayName: true, email: true } },
            receiver: { select: { id: true, displayName: true, email: true } },
          },
          orderBy: { createdAt: 'desc' },
          skip: type === 'review' ? skip : 0,
          take: type === 'review' ? pageSize : 10,
        }),
        this.prisma.rating.count({
          where: {
            comment: { not: null },
          },
        }),
      ]);

      items.push(
        ...reviews.map((r) => ({
          id: r.id,
          type: 'review',
          title: `Değerlendirme: ${r.score}/5`,
          description: r.comment?.substring(0, 200) || 'Yorum yok',
          score: r.score,
          reviewer: r.giver,
          reviewed: r.receiver,
          createdAt: r.createdAt,
          status: 'active',
        })),
      );
      // Don't add to totalCount if already filtered
    }

    // Sort by createdAt
    items.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

    return {
      data: type ? items : items.slice(0, pageSize),
      meta: {
        total: totalCount,
        page,
        pageSize,
        totalPages: Math.ceil(totalCount / pageSize),
      },
    };
  }

  /**
   * Get moderation statistics
   */
  async getModerationStats() {
    const [
      pendingProducts,
      pendingMessages,
      recentReviews,
      flaggedUsers,
    ] = await Promise.all([
      this.prisma.product.count({ where: { status: ProductStatus.pending } }),
      this.prisma.message.count({ where: { status: 'pending_approval' } }),
      this.prisma.rating.count({
        where: {
          createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
        },
      }),
      // Count users with warnings (using audit log for ban actions)
      this.prisma.auditLog.count({
        where: {
          action: { in: ['user_warn', 'user_flag'] },
          createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
        },
      }),
    ]);

    return {
      pendingProducts,
      reportedMessages: pendingMessages,
      recentReviews,
      flaggedUsers,
      totalPending: pendingProducts + pendingMessages,
    };
  }

  /**
   * AI ile denetlenmiş ürünleri skorlarıyla listele (admin "AI Denetim" sayfası).
   */
  async getAiModerationList(options: {
    status?: string;
    page?: number;
    pageSize?: number;
  }) {
    const { status, page = 1, pageSize = 20 } = options;
    const where: Prisma.ProductWhereInput = status
      ? { aiCheckStatus: status }
      : { aiCheckStatus: { not: null } };
    const [items, total] = await Promise.all([
      this.prisma.product.findMany({
        where,
        include: {
          seller: { select: { id: true, displayName: true, email: true } },
          images: { take: 1, orderBy: { sortOrder: 'asc' } },
        },
        orderBy: { aiCheckedAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.product.count({ where }),
    ]);
    return {
      data: items.map((p) => ({
        id: p.id,
        title: p.title,
        status: p.status,
        imageUrl: this.resolveProductImageUrl(p.images[0]?.cardKey) || null,
        seller: p.seller,
        aiCheckStatus: p.aiCheckStatus,
        aiRelevanceScore: p.aiRelevanceScore,
        aiNsfwScore: p.aiNsfwScore,
        aiCheckReason: p.aiCheckReason,
        aiCheckedAt: p.aiCheckedAt,
      })),
      meta: { total, page, pageSize, totalPages: Math.ceil(total / pageSize) },
    };
  }

  /**
   * Tek bir görseli AI ile test et (admin "Görsel Test Et" aracı) — ürün oluşturmadan skor gör.
   */
  async testImageModeration(imageUrl: string) {
    if (!imageUrl) {
      throw new BadRequestException('imageUrl gerekli');
    }
    if (!this.moderationAi.isEnabled) {
      return {
        enabled: false,
        message: 'AI moderasyon kapalı (AI_MODERATION_ENABLED=false)',
      };
    }
    const result = await this.moderationAi.moderateImage(imageUrl);
    if (!result) {
      return {
        enabled: true,
        error: 'AI servisine erişilemedi ya da görsel indirilemedi',
      };
    }
    return { enabled: true, ...result };
  }

  /** AI eşiklerini oku (admin "Kabul Eşiği" ayarı). */
  async getAiConfig() {
    if (!this.moderationAi.isEnabled) {
      return { enabled: false, relevanceThreshold: 0.2, nsfwThreshold: 0.7 };
    }
    const cfg = await this.moderationAi.getConfig();
    return {
      enabled: true,
      relevanceThreshold: cfg?.relevanceThreshold ?? 0.2,
      nsfwThreshold: cfg?.nsfwThreshold ?? 0.7,
    };
  }

  /** AI eşiklerini güncelle (canlı + kalıcı config.json). */
  async setAiConfig(relevanceThreshold?: number, nsfwThreshold?: number) {
    if (!this.moderationAi.isEnabled) {
      throw new BadRequestException('AI moderasyon kapalı');
    }
    const cfg = await this.moderationAi.setConfig({
      relevanceThreshold,
      nsfwThreshold,
    });
    if (!cfg) {
      throw new BadRequestException('AI servisine erişilemedi');
    }
    return { enabled: true, ...cfg };
  }

  /**
   * Approve moderation item
   */
  async approveModerationItem(
    adminId: string,
    type: string,
    itemId: string,
    notes?: string,
  ) {
    switch (type) {
      case 'product':
        const product = await this.prisma.product.findUnique({
          where: { id: itemId },
        });
        if (!product) throw new NotFoundException('Ürün bulunamadı');

        await this.prisma.product.update({
          where: { id: itemId },
          data: { status: ProductStatus.active },
        });

        await this.createAuditLog(adminId, 'moderation_approve', 'Product', itemId, product, {
          status: 'active',
          notes,
        });
        break;

      case 'message':
        const message = await this.prisma.message.findUnique({
          where: { id: itemId },
        });
        if (!message) throw new NotFoundException('Mesaj bulunamadı');

        await this.prisma.message.update({
          where: { id: itemId },
          data: {
            status: 'approved',
            reviewedById: adminId,
            reviewedAt: new Date(),
          },
        });

        await this.createAuditLog(adminId, 'moderation_approve', 'Message', itemId, message, {
          status: 'approved',
          notes,
        });
        break;

      case 'review':
        // Reviews are approved by default, this marks them as "verified"
        await this.createAuditLog(adminId, 'moderation_approve', 'Rating', itemId, null, {
          verified: true,
          notes,
        });
        break;

      default:
        throw new BadRequestException('Geçersiz moderasyon türü');
    }

    return { success: true, type, id: itemId, action: 'approved' };
  }

  /**
   * Reject moderation item
   */
  async rejectModerationItem(
    adminId: string,
    type: string,
    itemId: string,
    reason: string,
    notes?: string,
  ) {
    switch (type) {
      case 'product':
        const product = await this.prisma.product.findUnique({
          where: { id: itemId },
        });
        if (!product) throw new NotFoundException('Ürün bulunamadı');

        await this.prisma.product.update({
          where: { id: itemId },
          data: { status: ProductStatus.rejected },
        });

        await this.createAuditLog(adminId, 'moderation_reject', 'Product', itemId, product, {
          status: 'rejected',
          reason,
          notes,
        });
        break;

      case 'message':
        const messageToReject = await this.prisma.message.findUnique({
          where: { id: itemId },
        });
        if (!messageToReject) throw new NotFoundException('Mesaj bulunamadı');

        // Mark as rejected and hide content
        await this.prisma.message.update({
          where: { id: itemId },
          data: {
            status: 'rejected',
            filteredContent: '[Bu mesaj moderatör tarafından kaldırıldı]',
            flaggedReason: reason,
            reviewedById: adminId,
            reviewedAt: new Date(),
          },
        });

        await this.createAuditLog(adminId, 'moderation_reject', 'Message', itemId, messageToReject, {
          status: 'rejected',
          reason,
          notes,
        });
        break;

      case 'review':
        const review = await this.prisma.rating.findUnique({
          where: { id: itemId },
        });
        if (!review) throw new NotFoundException('Değerlendirme bulunamadı');

        // Delete the review
        await this.prisma.rating.delete({
          where: { id: itemId },
        });

        await this.createAuditLog(adminId, 'moderation_reject', 'Rating', itemId, review, {
          deleted: true,
          reason,
          notes,
        });
        break;

      default:
        throw new BadRequestException('Geçersiz moderasyon türü');
    }

    return { success: true, type, id: itemId, action: 'rejected', reason };
  }

  /**
   * Flag moderation item for priority review
   */
  async flagModerationItem(
    adminId: string,
    type: string,
    itemId: string,
    reason: string,
    priority?: string,
  ) {
    await this.createAuditLog(adminId, 'moderation_flag', type, itemId, null, {
      flagged: true,
      reason,
      priority: priority || 'normal',
    });

    return { success: true, type, id: itemId, action: 'flagged', reason, priority };
  }

  // ==================== PAYMENT MANAGEMENT ====================

  /**
   * Get all payments with filters
   */
  async getPayments(query: AdminPaymentQueryDto) {
    const page = query.page || 1;
    const limit = query.limit || 20;
    const skip = (page - 1) * limit;

    const where: Prisma.PaymentWhereInput = {};

    if (query.status) {
      where.status = query.status as PaymentStatus;
    }

    if (query.provider) {
      where.provider = query.provider;
    }

    if (query.startDate || query.endDate) {
      where.createdAt = {};
      if (query.startDate) {
        where.createdAt.gte = new Date(query.startDate);
      }
      if (query.endDate) {
        where.createdAt.lte = new Date(query.endDate);
      }
    }

    if (query.search) {
      const [paymentIds, orderIds] = await Promise.all([
        fulltextPaymentSearch(this.prisma, query.search),
        fulltextOrderSearch(this.prisma, query.search),
      ]);
      const conditions: Prisma.PaymentWhereInput[] = [];
      if (paymentIds.length > 0) conditions.push({ id: { in: paymentIds } });
      if (orderIds.length > 0) conditions.push({ orderId: { in: orderIds } });
      if (conditions.length === 0) {
        return { data: [], total: 0, page, limit, totalPages: 0 };
      }
      where.OR = conditions;
    }

    const [payments, total] = await Promise.all([
      this.prisma.payment.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: {
          order: {
            include: {
              buyer: { select: { id: true, displayName: true, email: true } },
              seller: { select: { id: true, displayName: true, email: true } },
              product: { select: { id: true, title: true } },
            },
          },
        },
      }),
      this.prisma.payment.count({ where }),
    ]);

    return {
      data: payments.map((p) => ({
        id: p.id,
        orderId: p.orderId,
        orderNumber: p.order.orderNumber,
        amount: Number(p.amount),
        currency: p.currency,
        provider: p.provider,
        status: p.status,
        failureReason: p.failureReason,
        providerPaymentId: p.providerPaymentId,
        providerConversationId: p.providerConversationId,
        buyer: p.order.buyer,
        seller: p.order.seller,
        product: p.order.product,
        createdAt: p.createdAt,
        updatedAt: p.updatedAt,
        paidAt: p.paidAt,
      })),
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Get payment by ID with full details
   */
  async getPaymentById(id: string) {
    const payment = await this.prisma.payment.findUnique({
      where: { id },
      include: {
        order: {
          include: {
            buyer: true,
            seller: true,
            product: true,
          },
        },
        paymentHolds: true,
      },
    });

    if (!payment) {
      throw new NotFoundException('Ödeme bulunamadı');
    }

    return {
      id: payment.id,
      orderId: payment.orderId,
      orderNumber: payment.order.orderNumber,
      amount: Number(payment.amount),
      currency: payment.currency,
      provider: payment.provider,
      status: payment.status,
      failureReason: payment.failureReason,
      providerPaymentId: payment.providerPaymentId,
      providerConversationId: payment.providerConversationId,
      metadata: payment.metadata,
      order: {
        id: payment.order.id,
        orderNumber: payment.order.orderNumber,
        status: payment.order.status,
        totalAmount: Number(payment.order.totalAmount),
        commissionAmount: Number(payment.order.commissionAmount),
        buyer: payment.order.buyer,
        seller: payment.order.seller,
        product: payment.order.product,
        shippingAddress: payment.order.shippingAddress,
      },
      paymentHold: payment.paymentHolds[0] ? {
        id: payment.paymentHolds[0].id,
        amount: Number(payment.paymentHolds[0].amount),
        status: payment.paymentHolds[0].status,
        releaseAt: payment.paymentHolds[0].releaseAt,
        releasedAt: payment.paymentHolds[0].releasedAt,
      } : null,
      paymentHolds: payment.paymentHolds.map((hold) => ({
        id: hold.id,
        orderId: hold.orderId,
        sellerId: hold.sellerId,
        amount: Number(hold.amount),
        status: hold.status,
        releaseAt: hold.releaseAt,
        releasedAt: hold.releasedAt,
      })),
      createdAt: payment.createdAt,
      updatedAt: payment.updatedAt,
      paidAt: payment.paidAt,
    };
  }

  /**
   * Get payment statistics
   */
  async getPaymentStatistics(query: PaymentStatisticsQueryDto) {
    const startDate = query.startDate ? new Date(query.startDate) : new Date();
    const endDate = query.endDate ? new Date(query.endDate) : new Date();

    // Adjust start date based on period
    if (query.period === 'daily') {
      startDate.setDate(startDate.getDate() - 30);
    } else if (query.period === 'weekly') {
      startDate.setDate(startDate.getDate() - 90);
    } else if (query.period === 'monthly') {
      startDate.setMonth(startDate.getMonth() - 12);
    }

    const where: Prisma.PaymentWhereInput = {
      createdAt: {
        gte: startDate,
        lte: endDate,
      },
    };

    const [
      totalPayments,
      completedPayments,
      failedPayments,
      totalRevenue,
      paymentsByProvider,
      paymentsByStatus,
      averageAmount,
    ] = await Promise.all([
      this.prisma.payment.count({ where }),
      this.prisma.payment.count({
        where: { ...where, status: PaymentStatus.completed },
      }),
      this.prisma.payment.count({
        where: { ...where, status: PaymentStatus.failed },
      }),
      this.prisma.payment.aggregate({
        where: { ...where, status: PaymentStatus.completed },
        _sum: { amount: true },
      }),
      this.prisma.payment.groupBy({
        by: ['provider'],
        where,
        _count: { id: true },
        _sum: { amount: true },
      }),
      this.prisma.payment.groupBy({
        by: ['status'],
        where,
        _count: { id: true },
      }),
      this.prisma.payment.aggregate({
        where: { ...where, status: PaymentStatus.completed },
        _avg: { amount: true },
      }),
    ]);

    const successRate =
      totalPayments > 0 ? (completedPayments / totalPayments) * 100 : 0;

    return {
      period: query.period || 'monthly',
      startDate,
      endDate,
      summary: {
        totalPayments,
        completedPayments,
        failedPayments,
        pendingPayments: totalPayments - completedPayments - failedPayments,
        totalRevenue: Number(totalRevenue._sum.amount || 0),
        averageAmount: Number(averageAmount._avg.amount || 0),
        successRate: Number(successRate.toFixed(2)),
      },
      byProvider: paymentsByProvider.map((p) => ({
        provider: p.provider,
        count: p._count.id,
        totalAmount: Number(p._sum.amount || 0),
        percentage: totalPayments > 0 ? (p._count.id / totalPayments) * 100 : 0,
      })),
      byStatus: paymentsByStatus.map((p) => ({
        status: p.status,
        count: p._count.id,
        percentage: totalPayments > 0 ? (p._count.id / totalPayments) * 100 : 0,
      })),
    };
  }

  /**
   * Get failed payments
   */
  async getFailedPayments(query: AdminPaymentQueryDto) {
    const page = query.page || 1;
    const limit = query.limit || 20;
    const skip = (page - 1) * limit;

    const where: Prisma.PaymentWhereInput = {
      status: PaymentStatus.failed,
    };

    if (query.provider) {
      where.provider = query.provider;
    }

    if (query.startDate || query.endDate) {
      where.createdAt = {};
      if (query.startDate) {
        where.createdAt.gte = new Date(query.startDate);
      }
      if (query.endDate) {
        where.createdAt.lte = new Date(query.endDate);
      }
    }

    if (query.search) {
      const [paymentIds, orderIds] = await Promise.all([
        fulltextPaymentSearch(this.prisma, query.search),
        fulltextOrderSearch(this.prisma, query.search),
      ]);
      const conditions: Prisma.PaymentWhereInput[] = [];
      if (paymentIds.length > 0) conditions.push({ id: { in: paymentIds } });
      if (orderIds.length > 0) conditions.push({ orderId: { in: orderIds } });
      if (conditions.length === 0) {
        return { data: [], total: 0, page, limit, totalPages: 0 };
      }
      where.OR = conditions;
    }

    const [payments, total] = await Promise.all([
      this.prisma.payment.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: {
          order: {
            include: {
              buyer: { select: { id: true, displayName: true, email: true } },
              product: { select: { id: true, title: true } },
            },
          },
        },
      }),
      this.prisma.payment.count({ where }),
    ]);

    return {
      data: payments.map((p) => ({
        id: p.id,
        orderId: p.orderId,
        orderNumber: p.order.orderNumber,
        amount: Number(p.amount),
        provider: p.provider,
        failureReason: p.failureReason,
        buyer: p.order.buyer,
        product: p.order.product,
        createdAt: p.createdAt,
      })),
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Manual refund by admin
   */
  async manualRefund(
    adminId: string,
    paymentId: string,
    amount?: number,
    reason?: string,
  ) {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      include: { order: true },
    });

    if (!payment) {
      throw new NotFoundException('Ödeme bulunamadı');
    }

    if (payment.status !== PaymentStatus.completed) {
      throw new BadRequestException('Sadece tamamlanmış ödemeler iade edilebilir');
    }

    const refundAmount = amount || Number(payment.amount);

    // Process refund via PaymentService
    const refundResult = await this.paymentService.processRefund(
      payment.orderId,
      refundAmount,
    );

    // Log admin action
    await this.createAuditLog(
      adminId,
      'payment_manual_refund',
      'Payment',
      paymentId,
      { status: payment.status, amount: Number(payment.amount) },
      {
        status: PaymentStatus.refunded,
        refundAmount,
        reason: reason || 'Admin tarafından manuel iade',
      },
    );

    return {
      ...refundResult,
      reason: reason || 'Admin tarafından manuel iade',
    };
  }

  /**
   * Get refund history (refunded payments with pagination)
   */
  async getRefundHistory(query: {
    search?: string;
    startDate?: Date;
    endDate?: Date;
    page?: number;
    limit?: number;
  }) {
    const { search, startDate, endDate, page = 1, limit = 20 } = query;

    const where: Prisma.PaymentWhereInput = {
      status: PaymentStatus.refunded,
    };

    if (search) {
      const userIds = await fulltextUserSearch(this.prisma, search);
      const conditions: Prisma.PaymentWhereInput[] = [];
      if (userIds.length > 0) conditions.push({ order: { buyerId: { in: userIds } } });
      if (search.length >= 3) conditions.push({ id: { startsWith: search } });
      if (conditions.length === 0) {
        return { data: [], total: 0, page, limit, totalPages: 0 };
      }
      where.OR = conditions;
    }

    if (startDate || endDate) {
      where.updatedAt = {};
      if (startDate) where.updatedAt.gte = startDate;
      if (endDate) where.updatedAt.lte = endDate;
    }

    const [total, payments] = await Promise.all([
      this.prisma.payment.count({ where }),
      this.prisma.payment.findMany({
        where,
        include: {
          order: {
            include: {
              buyer: { select: { id: true, displayName: true, email: true } },
              seller: { select: { id: true, displayName: true, email: true } },
              product: { select: { id: true, title: true } },
            },
          },
        },
        orderBy: { updatedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return {
      data: payments.map(p => ({
        id: p.id,
        amount: Number(p.amount),
        status: p.status,
        refundedAt: p.updatedAt,
        order: p.order ? {

          id: p.order.id,
          buyer: p.order.buyer,
          seller: p.order.seller,
          product: p.order.product,
        } : null,
      })),
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  /**
   * Force cancel payment by admin
   */
  async forceCancelPayment(adminId: string, paymentId: string, reason: string) {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      include: { order: true },
    });

    if (!payment) {
      throw new NotFoundException('Ödeme bulunamadı');
    }

    if (payment.status === PaymentStatus.completed) {
      throw new BadRequestException('Tamamlanmış ödemeler iptal edilemez, iade yapın');
    }

    const oldStatus = payment.status;

    // Update payment status
    await this.prisma.payment.update({
      where: { id: paymentId },
      data: {
        status: PaymentStatus.failed,
        failureReason: `Admin tarafından zorla iptal edildi: ${reason}`,
      },
    });

    // Log admin action
    await this.createAuditLog(
      adminId,
      'payment_force_cancel',
      'Payment',
      paymentId,
      { status: oldStatus },
      {
        status: PaymentStatus.failed,
        reason: `Admin tarafından zorla iptal edildi: ${reason}`,
      },
    );

    return {
      success: true,
      paymentId,
      message: 'Ödeme zorla iptal edildi',
      reason,
    };
  }

  // ==================== SELLER PAYOUTS ====================

  /**
   * Payout summary: total pending (held), total released, counts, next release dates
   */
  async getPayoutsSummary() {
    const [heldAgg, releasedAgg, heldCount, releasedCount, nextReleases] = await Promise.all([
      this.prisma.paymentHold.aggregate({
        where: { status: PaymentHoldStatus.held },
        _sum: { amount: true },
      }),
      this.prisma.paymentHold.aggregate({
        where: { status: PaymentHoldStatus.released },
        _sum: { amount: true },
      }),
      this.prisma.paymentHold.count({ where: { status: PaymentHoldStatus.held } }),
      this.prisma.paymentHold.count({ where: { status: PaymentHoldStatus.released } }),
      this.prisma.paymentHold.findMany({
        where: { status: PaymentHoldStatus.held, releaseAt: { not: null } },
        orderBy: { releaseAt: 'asc' },
        take: 5,
        select: { id: true, orderId: true, amount: true, releaseAt: true, sellerId: true },
      }),
    ]);

    const totalPending = Number(heldAgg._sum.amount ?? 0);
    const totalReleased = Number(releasedAgg._sum.amount ?? 0);

    return {
      totalPending: Math.round(totalPending * 100) / 100,
      totalReleased: Math.round(totalReleased * 100) / 100,
      countHeld: heldCount,
      countReleased: releasedCount,
      nextReleases: nextReleases.map((r) => ({
        id: r.id,
        orderId: r.orderId,
        amount: Number(r.amount),
        releaseAt: r.releaseAt,
        sellerId: r.sellerId,
      })),
    };
  }

  /**
   * Payout transaction history (payment holds with order/seller info)
   */
  async getPayoutsTransactions(query: PayoutTransactionsQueryDto) {
    const { sellerId, status, dateFrom, dateTo, page = 1, limit = 20 } = query;
    const where: Prisma.PaymentHoldWhereInput = {};
    if (sellerId) where.sellerId = sellerId;
    if (status) where.status = status as PaymentHoldStatus;
    if (dateFrom || dateTo) {
      where.createdAt = {};
      if (dateFrom) where.createdAt.gte = new Date(dateFrom);
      if (dateTo) where.createdAt.lte = new Date(dateTo);
    }

    const [total, holds] = await Promise.all([
      this.prisma.paymentHold.count({ where }),
      this.prisma.paymentHold.findMany({
        where,
        include: {
          payment: { select: { id: true, paidAt: true } },
          seller: { select: { id: true, displayName: true, email: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    const orders = await this.prisma.order.findMany({
      where: { id: { in: holds.map((h) => h.orderId) } },
      select: { id: true, orderNumber: true },
    });
    const orderMap = new Map(orders.map((o) => [o.id, o]));

    return {
      data: holds.map((h) => ({
        id: h.id,
        orderId: h.orderId,
        orderNumber: orderMap.get(h.orderId)?.orderNumber ?? '-',
        sellerId: h.sellerId,
        sellerName: h.seller.displayName ?? h.seller.email,
        sellerEmail: h.seller.email,
        amount: Number(h.amount),
        status: h.status,
        releaseAt: h.releaseAt,
        releasedAt: h.releasedAt,
        paidAt: h.payment?.paidAt,
        createdAt: h.createdAt,
      })),
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Payout schedule: holds with status=held, ordered by releaseAt (upcoming releases)
   */
  async getPayoutsSchedule(query: { sellerId?: string; limit?: number }) {
    const { sellerId, limit = 50 } = query;
    const where: Prisma.PaymentHoldWhereInput = { status: PaymentHoldStatus.held };
    if (sellerId) where.sellerId = sellerId;

    const holds = await this.prisma.paymentHold.findMany({
      where,
      include: {
        seller: { select: { id: true, displayName: true, email: true } },
      },
      orderBy: { releaseAt: 'asc' },
      take: limit,
    });

    const orders = await this.prisma.order.findMany({
      where: { id: { in: holds.map((h) => h.orderId) } },
      select: { id: true, orderNumber: true },
    });
    const orderMap = new Map(orders.map((o) => [o.id, o]));

    return {
      data: holds.map((h) => ({
        id: h.id,
        orderId: h.orderId,
        orderNumber: orderMap.get(h.orderId)?.orderNumber ?? '-',
        sellerId: h.sellerId,
        sellerName: h.seller.displayName ?? h.seller.email,
        amount: Number(h.amount),
        releaseAt: h.releaseAt,
        createdAt: h.createdAt,
      })),
    };
  }

  /**
   * Export payout transactions as CSV
   */
  async getPayoutsExport(query: PayoutExportQueryDto) {
    const { sellerId, status, dateFrom, dateTo } = query;
    const where: Prisma.PaymentHoldWhereInput = {};
    if (sellerId) where.sellerId = sellerId;
    if (status) where.status = status as PaymentHoldStatus;
    if (dateFrom || dateTo) {
      where.createdAt = {};
      if (dateFrom) where.createdAt.gte = new Date(dateFrom);
      if (dateTo) where.createdAt.lte = new Date(dateTo);
    }

    const holds = await this.prisma.paymentHold.findMany({
      where,
      include: {
        seller: { select: { displayName: true, email: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 5000,
    });

    const orders = await this.prisma.order.findMany({
      where: { id: { in: holds.map((h) => h.orderId) } },
      select: { id: true, orderNumber: true },
    });
    const orderMap = new Map(orders.map((o) => [o.id, o]));

    const headers = ['id', 'orderId', 'orderNumber', 'sellerId', 'sellerName', 'sellerEmail', 'amount', 'status', 'releaseAt', 'releasedAt', 'createdAt'];
    const rows = holds.map((h) =>
      [
        h.id,
        h.orderId,
        orderMap.get(h.orderId)?.orderNumber ?? '',
        h.sellerId,
        h.seller.displayName ?? h.seller.email ?? '',
        h.seller.email ?? '',
        Number(h.amount),
        h.status,
        h.releaseAt ? new Date(h.releaseAt).toISOString() : '',
        h.releasedAt ? new Date(h.releasedAt).toISOString() : '',
        new Date(h.createdAt).toISOString(),
      ].map((c) => (typeof c === 'string' && c.includes(',') ? `"${c.replace(/"/g, '""')}"` : c)).join(','),
    );
    const csv = [headers.join(','), ...rows].join('\n');
    return { csv, filename: `payouts-${new Date().toISOString().slice(0, 10)}.csv` };
  }

  /**
   * Release payment hold to seller (admin manual release)
   */
  async releasePayout(adminId: string, orderId: string) {
    await this.paymentService.releasePayment(orderId);
    await this.createAuditLog(adminId, 'payout_release', 'PaymentHold', orderId, { action: 'release' }, { releasedAt: new Date() });
    return { success: true, orderId, message: 'Ödeme satıcıya serbest bırakıldı' };
  }

  /**
   * Release trade cash payment hold (admin manual release for trade escrow)
   */
  async releaseTradePaymentHold(adminId: string, tradeId: string) {
    const tcp = await this.prisma.tradeCashPayment.findUnique({ where: { tradeId } });
    if (!tcp) throw new NotFoundException('Trade cash payment bulunamadı');
    if (tcp.releasedAt) return { success: true, message: 'Zaten serbest bırakılmış' };
    if (tcp.refundedAt) throw new BadRequestException('İade edilmiş ödeme serbest bırakılamaz');

    await this.prisma.tradeCashPayment.update({
      where: { tradeId },
      data: { releasedAt: new Date() },
    });
    await this.createAuditLog(adminId, 'trade_cash_hold_release', 'TradeCashPayment', tcp.id, { action: 'manual_release' }, { releasedAt: new Date() });
    return { success: true, tradeId, message: 'Takas nakit ödemesi serbest bırakıldı' };
  }

  /**
   * Retry a failed payout transfer
   */
  async retryPayoutTransfer(adminId: string, transferId: string) {
    const transfer = await this.prisma.payoutTransfer.findUnique({ where: { id: transferId } });
    if (!transfer) throw new NotFoundException('Payout transfer bulunamadı');
    if (!['failed', 'returned'].includes(transfer.status)) {
      throw new BadRequestException(`Transfer durumu '${transfer.status}' tekrar denenebilir değil`);
    }

    await this.prisma.payoutTransfer.update({
      where: { id: transferId },
      data: { status: 'pending', failureReason: null, retryCount: 0, nextRetryAt: null },
    });
    await this.createAuditLog(adminId, 'payout_retry', 'PayoutTransfer', transferId, { action: 'admin_retry' }, { status: 'pending' });
    return { success: true, transferId, message: 'Transfer tekrar denenmek üzere sıraya alındı' };
  }

  /**
   * Get failed/returned payout transfers
   */
  async getFailedPayouts(page = 1, limit = 20) {
    const where = { status: { in: ['failed' as const, 'returned' as const] } };
    const [items, total] = await Promise.all([
      this.prisma.payoutTransfer.findMany({
        where,
        include: { seller: { select: { id: true, displayName: true, email: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.payoutTransfer.count({ where }),
    ]);
    return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  // ==================== TRADE MANAGEMENT ====================

  /**
   * Get trades with filters for admin
   */
  async getTrades(query: {
    status?: TradeStatus;
    initiatorId?: string;
    receiverId?: string;
    userId?: string;
    fromDate?: string;
    toDate?: string;
    page?: number;
    limit?: number;
  }) {
    const { status, initiatorId, receiverId, userId, fromDate, toDate, page = 1, limit = 20 } = query;

    const where: Prisma.TradeWhereInput = {};

    if (status) {
      where.status = status;
    }

    if (userId) {
      where.OR = [
        { initiatorId: userId },
        { receiverId: userId },
      ];
    } else {
      if (initiatorId) {
        where.initiatorId = initiatorId;
      }
      if (receiverId) {
        where.receiverId = receiverId;
      }
    }

    if (fromDate || toDate) {
      where.createdAt = {};
      if (fromDate) {
        where.createdAt.gte = new Date(fromDate);
      }
      if (toDate) {
        where.createdAt.lte = new Date(toDate);
      }
    }

    const [total, trades] = await Promise.all([
      this.prisma.trade.count({ where }),
      this.prisma.trade.findMany({
        where,
        include: {
          initiator: { select: { id: true, displayName: true, email: true } },
          receiver: { select: { id: true, displayName: true, email: true } },
          items: {
            include: {
              product: {
                select: {
                  id: true,
                  title: true,
                  price: true,
                  images: { take: 1, orderBy: { sortOrder: 'asc' } },
                },
              },
            },
          },
          shipments: true,
          cashPayment: true,
          dispute: true,
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return {
      data: trades,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  /**
   * List ALL TradeShipments across trades with status / leg / tradeNumber filters.
   * Joins shipper and (when present) recipient users by user id since
   * TradeShipment does not have direct relations to User.
   */
  async findTradeShipments(query: {
    status?: ShipmentStatus;
    leg?: 'to_warehouse' | 'from_warehouse' | 'return';
    tradeNumber?: string;
    page?: number;
    limit?: number;
  }) {
    const { status, leg, tradeNumber, page = 1, limit = 20 } = query;

    const where: Prisma.TradeShipmentWhereInput = {
      ...(status && { status }),
      ...(leg && { leg }),
      ...(tradeNumber && {
        trade: {
          tradeNumber: { contains: tradeNumber, mode: 'insensitive' },
        },
      }),
    };

    const [total, shipments] = await Promise.all([
      this.prisma.tradeShipment.count({ where }),
      this.prisma.tradeShipment.findMany({
        where,
        include: {
          trade: {
            select: { id: true, tradeNumber: true, status: true },
          },
        },
        orderBy: { updatedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    // Resolve shipper / recipient users in a single batched query
    const userIds = Array.from(
      new Set(
        shipments
          .flatMap((s) => [s.shipperId, s.recipientUserId])
          .filter((v): v is string => !!v),
      ),
    );

    const users = userIds.length
      ? await this.prisma.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, displayName: true, email: true },
        })
      : [];
    const userMap = new Map(users.map((u) => [u.id, u]));

    const data = shipments.map((s) => ({
      ...s,
      shipper: userMap.get(s.shipperId) ?? null,
      recipientUser: s.recipientUserId
        ? userMap.get(s.recipientUserId) ?? null
        : null,
    }));

    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  /**
   * Get trade by ID for admin
   */
  async getTradeById(tradeId: string) {
    const trade = await this.prisma.trade.findUnique({
      where: { id: tradeId },
      include: {
        initiator: {
          select: {
            id: true,
            displayName: true,
            email: true,
            phone: true,
            addresses: true,
          },
        },
        receiver: {
          select: {
            id: true,
            displayName: true,
            email: true,
            phone: true,
            addresses: true,
          },
        },
        items: {
          include: {
            product: {
              include: {
                images: { orderBy: { sortOrder: 'asc' } },
                category: true,
                seller: { select: { id: true, displayName: true } },
              },
            },
          },
        },
        shipments: {
          include: {
            events: { orderBy: { eventTime: 'asc' } },
          },
        },
        cashPayment: true,
        dispute: true,
      },
    });

    if (!trade) {
      throw new NotFoundException('Takas bulunamadı');
    }

    return trade;
  }

  /**
   * Resolve trade dispute or cancel trade
   */
  async resolveTrade(adminId: string, tradeId: string, dto: { resolution: string; note?: string }) {
    const trade = await this.prisma.trade.findUnique({
      where: { id: tradeId },
      include: {
        items: true,
        dispute: true,
      },
    });

    if (!trade) {
      throw new NotFoundException('Takas bulunamadı');
    }

    return this.prisma.$transaction(async (tx) => {
      // Get all trade items
      const allItems = await tx.tradeItem.findMany({
        where: { tradeId },
      });

      const productIds = allItems.map((item) => item.productId);

      let updatedTrade;
      let newStatus: TradeStatus;

      if (dto.resolution === 'cancel') {
        // Cancel trade - make products active again
        newStatus = TradeStatus.cancelled;

        await tx.product.updateMany({
          where: { id: { in: productIds } },
          data: { status: ProductStatus.active },
        });

        updatedTrade = await tx.trade.update({
          where: { id: tradeId },
          data: {
            status: newStatus,
            cancelledAt: new Date(),
            cancelReason: dto.note || 'Admin tarafından iptal edildi',
          },
        });
      } else if (dto.resolution === 'favor_initiator' || dto.resolution === 'complete_trade') {
        // Complete trade
        newStatus = TradeStatus.completed;

        // CRITICAL: When trade is completed, products should be marked as inactive
        // (not sold) so they disappear from listings
        await tx.product.updateMany({
          where: { id: { in: productIds } },
          data: { status: ProductStatus.inactive },
        });

        updatedTrade = await tx.trade.update({
          where: { id: tradeId },
          data: {
            status: newStatus,
            completedAt: new Date(),
          },
        });

        // Update dispute if exists
        if (trade.dispute) {
          await tx.tradeDispute.update({
            where: { tradeId },
            data: {
              resolution: dto.resolution,
              resolvedById: adminId,
              resolvedAt: new Date(),
              resolutionNotes: dto.note,
            },
          });
        }
      } else if (dto.resolution === 'favor_receiver') {
        // Cancel and return products
        newStatus = TradeStatus.cancelled;

        await tx.product.updateMany({
          where: { id: { in: productIds } },
          data: { status: ProductStatus.active },
        });

        updatedTrade = await tx.trade.update({
          where: { id: tradeId },
          data: {
            status: newStatus,
            cancelledAt: new Date(),
            cancelReason: dto.note || 'Alıcı lehine iptal edildi',
          },
        });

        // Update dispute if exists
        if (trade.dispute) {
          await tx.tradeDispute.update({
            where: { tradeId },
            data: {
              resolution: dto.resolution,
              resolvedById: adminId,
              resolvedAt: new Date(),
              resolutionNotes: dto.note,
            },
          });
        }
      } else {
        throw new BadRequestException('Geçersiz çözüm tipi. Geçerli değerler: cancel, favor_initiator, favor_receiver, complete_trade');
      }

      // Create audit log
      await this.createAuditLog(adminId, 'trade_resolve', 'Trade', tradeId, trade, {
        ...updatedTrade,
        resolution: dto.resolution,
        note: dto.note,
      });

      return { success: true, tradeId, resolution: dto.resolution, status: newStatus };
    });
  }

  // -------- Safe-trade (warehouse escrow) admin flow --------

  /**
   * Resolve the platform warehouse address used as `fromAddressId` for
   * outbound and return shipments. First tries PlatformSetting key
   * `warehouse_address_id`; falls back to the first address of any active
   * admin user. Throws if no warehouse address can be determined.
   */
  private async resolveWarehouseAddressId(
    tx: Prisma.TransactionClient,
  ): Promise<string> {
    const setting = await tx.platformSetting.findUnique({
      where: { settingKey: 'warehouse_address_id' },
    });
    if (setting?.settingValue) {
      const addr = await tx.address.findUnique({
        where: { id: setting.settingValue },
        select: { id: true },
      });
      if (addr) return addr.id;
    }

    // Fallback: any active admin user's first address
    const admin = await tx.adminUser.findFirst({
      where: { isActive: true },
      select: { userId: true },
      orderBy: { createdAt: 'asc' },
    });
    if (admin) {
      const fallback = await tx.address.findFirst({
        where: { userId: admin.userId },
        select: { id: true },
      });
      if (fallback) return fallback.id;
    }

    throw new BadRequestException(
      'Depo adresi yapılandırılmamış. Lütfen `warehouse_address_id` platform ayarını tanımlayın.',
    );
  }

  /**
   * Sürat submit helper for the reject return leg. Falls back to an internal
   * tracking number when the integration is disabled.
   */
  private async submitReturnToSuratForReject(
    tradeId: string,
    oid: string,
    address: any,
    user: any,
  ): Promise<{ carrier: string; trackingNumber: string }> {
    if (!this.suratCargoService || !this.suratCargoService.isIntegrationEnabled()) {
      const fallbackTracking = `TRK${Date.now().toString(36).toUpperCase()}${Math.random()
        .toString(36)
        .substring(2, 6)
        .toUpperCase()}`;
      return { carrier: 'Tarodan Warehouse', trackingNumber: fallbackTracking };
    }
    const result = await this.suratCargoService.submitShipmentWithRetry({
      idempotencyKey: `surat:trade-return:${oid}`,
      correlationId: `trade-reject-${tradeId}`,
      payload: {
        KisiKurum: address.fullName || user?.displayName || 'Takas İade',
        SahisBirim: 'Takas İade Gönderisi',
        AliciAdresi: address.address,
        Il: normalizeSuratLocation(address.city),
        Ilce: normalizeSuratLocation(address.district),
        TelefonCep: normalizeSuratPhone(address.phone),
        KargoTuru: SuratKargoTuru.Koli,
        OdemeTipi: SuratOdemeTipi.Pesin,
        OzelKargoTakipNo: oid,
        Adet: 1,
        BirimDesi: 1,
        BirimKg: 1,
        KapidanOdemeTahsilatTipi: 1,
        TasimaSekli: SuratTasimaSekli.KaraYolu,
        TeslimSekli: SuratTeslimSekli.AdreseTeslim,
        GonderiSekli: SuratGonderiSekli.Standart,
        Pazaryerimi: 0,
        Iademi: true,
      },
    });
    if (!result.ok) {
      const r = result as any;
      const errMsg = r.kind === 'business' ? r.suratMessage : `technical: ${r.code}`;
      throw new BadRequestException(`Sürat iade kargo siparişi reddedildi: ${errMsg}`);
    }
    return { carrier: 'surat', trackingNumber: oid };
  }

  /**
   * Admin marks one of the two to_warehouse shipments as delivered to the
   * Tarodan warehouse. When both to_warehouse shipments are delivered, the
   * trade transitions to `at_warehouse` so admin review can begin.
   */
  async markWarehouseReceived(
    adminId: string,
    tradeId: string,
    shipmentId: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      // Lock the trade row for the duration of the transaction
      await tx.$queryRaw`SELECT id FROM trades WHERE id = ${tradeId} FOR UPDATE`;

      const trade = await tx.trade.findUnique({
        where: { id: tradeId },
        select: {
          id: true,
          status: true,
          initiatorId: true,
          receiverId: true,
          firstWarehouseArrivalAt: true,
        },
      });
      if (!trade) {
        throw new NotFoundException('Takas bulunamadı');
      }

      const shipment = await tx.tradeShipment.findUnique({
        where: { id: shipmentId },
      });
      if (!shipment || shipment.tradeId !== tradeId) {
        throw new NotFoundException('Gönderim bulunamadı');
      }
      if (shipment.leg !== 'to_warehouse') {
        throw new BadRequestException(
          'Bu gönderim depoya gelen bir gönderim değil',
        );
      }
      if (shipment.deliveredAt) {
        throw new BadRequestException(
          'Bu gönderim zaten teslim alındı olarak işaretlenmiş',
        );
      }

      const now = new Date();
      const updatedShipment = await tx.tradeShipment.update({
        where: { id: shipmentId },
        data: {
          status: ShipmentStatus.delivered,
          deliveredAt: now,
        },
      });

      // Check if both to_warehouse shipments are now delivered
      const toWarehouseShipments = await tx.tradeShipment.findMany({
        where: { tradeId, leg: 'to_warehouse' },
        select: { id: true, deliveredAt: true },
      });
      const bothDelivered =
        toWarehouseShipments.length >= 2 &&
        toWarehouseShipments.every((s) => s.deliveredAt !== null);

      // Lock user-side cancel on the first warehouse arrival. From this point
      // on, only admin can unwind the trade (reject or force-cancel-stuck).
      const isFirstArrival = trade.firstWarehouseArrivalAt === null;

      let nextStatus: TradeStatus = trade.status;
      if (bothDelivered && trade.status !== TradeStatus.at_warehouse) {
        await tx.trade.update({
          where: { id: tradeId },
          data: {
            status: TradeStatus.at_warehouse,
            updatedAt: now,
            ...(isFirstArrival
              ? { firstWarehouseArrivalAt: now, cancelLockedAt: now }
              : {}),
          },
        });
        nextStatus = TradeStatus.at_warehouse;
      } else if (isFirstArrival) {
        await tx.trade.update({
          where: { id: tradeId },
          data: {
            firstWarehouseArrivalAt: now,
            cancelLockedAt: now,
            updatedAt: now,
          },
        });
      }

      await this.createAuditLog(
        adminId,
        'trade_warehouse_received',
        'TradeShipment',
        shipmentId,
        shipment,
        {
          ...updatedShipment,
          bothDelivered,
          tradeStatus: nextStatus,
          firstArrival: isFirstArrival,
        },
      );

      return {
        success: true,
        tradeId,
        shipmentId,
        status: nextStatus,
        bothDelivered,
        firstArrival: isFirstArrival,
        initiatorId: trade.initiatorId,
        receiverId: trade.receiverId,
      };
    }).then(async (res) => {
      if (res.firstArrival) {
        try {
          await this.eventService.emitTradeCancelLocked({
            tradeId: res.tradeId,
            initiatorId: res.initiatorId,
            receiverId: res.receiverId,
          });
        } catch (err) {
          this.logger.error(
            `Failed to emit trade.cancel-locked for trade ${res.tradeId}: ${err}`,
          );
        }
      }
      return res;
    });
  }

  /**
   * Admin approves the safe-trade after inspecting both items at the
   * warehouse. Creates two outbound shipments (one to each party, carrying
   * the other party's items) and transitions trade to
   * `shipping_to_recipients`.
   */
  /**
   * Takasta bir tarafın teslimat adresini çözer: önce takasta SEÇİLEN adres
   * (Trade.initiator/receiverAddressId), yoksa kullanıcının varsayılan adresi.
   */
  private async pickTradeSideAddress(
    tx: any,
    chosenId: string | null,
    userId: string,
  ): Promise<any> {
    if (chosenId) {
      const chosen = await tx.address.findFirst({ where: { id: chosenId, userId } });
      if (chosen) return chosen;
    }
    return tx.address.findFirst({
      where: { userId },
      orderBy: { isDefault: 'desc' },
    });
  }

  async approveWarehouseTrade(
    adminId: string,
    tradeId: string,
    dto: ApproveWarehouseTradeDto,
  ) {
    const result = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM trades WHERE id = ${tradeId} FOR UPDATE`;

      const trade = await tx.trade.findUnique({
        where: { id: tradeId },
        include: {
          items: true,
        },
      });
      if (!trade) {
        throw new NotFoundException('Takas bulunamadı');
      }

      if (
        trade.status !== TradeStatus.at_warehouse &&
        trade.status !== TradeStatus.admin_reviewing
      ) {
        throw new BadRequestException(
          `Takas durumu '${trade.status}' onay için uygun değil. Beklenen: at_warehouse veya admin_reviewing.`,
        );
      }

      const [initiatorAddress, receiverAddress] = await Promise.all([
        this.pickTradeSideAddress(tx, trade.initiatorAddressId, trade.initiatorId),
        this.pickTradeSideAddress(tx, trade.receiverAddressId, trade.receiverId),
      ]);

      if (!initiatorAddress) {
        throw new BadRequestException(
          'Takası başlatan kullanıcının kayıtlı adresi yok',
        );
      }
      if (!receiverAddress) {
        throw new BadRequestException(
          'Takası alan kullanıcının kayıtlı adresi yok',
        );
      }

      const warehouseAddressId = await this.resolveWarehouseAddressId(tx);

      const genTrackingNumber = () =>
        `TRK${Date.now().toString(36).toUpperCase()}${Math.random()
          .toString(36)
          .substring(2, 6)
          .toUpperCase()}`;

      const now = new Date();

      // Submit each warehouse-to-recipient leg to Sürat as a real shipment.
      // If integration is disabled, falls back to internal tracking number.
      const initiatorOid = `TRD-${trade.tradeNumber}-INI`.replace(/[^a-zA-Z0-9-]/g, '').slice(0, 50);
      const receiverOid = `TRD-${trade.tradeNumber}-REC`.replace(/[^a-zA-Z0-9-]/g, '').slice(0, 50);

      const initiatorUser = await tx.user.findUnique({ where: { id: trade.initiatorId } });
      const receiverUser = await tx.user.findUnique({ where: { id: trade.receiverId } });

      const submitToSurat = async (oid: string, addr: any, user: any): Promise<{ carrier: string; trackingNumber: string }> => {
        if (!this.suratCargoService || !this.suratCargoService.isIntegrationEnabled()) {
          return { carrier: 'Tarodan Warehouse', trackingNumber: genTrackingNumber() };
        }
        try {
          const result = await this.suratCargoService.submitShipmentWithRetry({
            idempotencyKey: `surat:trade:${oid}`,
            correlationId: `trade-approve-${tradeId}`,
            payload: {
              KisiKurum: addr.fullName || user?.displayName || 'Takas Alıcısı',
              SahisBirim: 'Takas Gönderisi',
              AliciAdresi: addr.address,
              Il: normalizeSuratLocation(addr.city),
              Ilce: normalizeSuratLocation(addr.district),
              TelefonCep: normalizeSuratPhone(addr.phone),
              KargoTuru: SuratKargoTuru.Koli,
              OdemeTipi: SuratOdemeTipi.Pesin,
              OzelKargoTakipNo: oid,
              Adet: 1,
              BirimDesi: 1,
              BirimKg: 1,
              KapidanOdemeTahsilatTipi: 1,
              TasimaSekli: SuratTasimaSekli.KaraYolu,
              TeslimSekli: SuratTeslimSekli.AdreseTeslim,
              GonderiSekli: SuratGonderiSekli.Standart,
              Pazaryerimi: 0,
              Iademi: false,
            },
          });
          if (!result.ok) {
            const r = result as any;
            const errMsg = r.kind === 'business' ? r.suratMessage : `technical: ${r.code}`;
            throw new BadRequestException(
              `Sürat kargo onay siparişi reddedildi: ${errMsg}`,
            );
          }
          return { carrier: 'surat', trackingNumber: oid };
        } catch (error: any) {
          this.logger.error(`Surat shipment submit failed for trade ${tradeId}: ${error.message}`);
          throw error;
        }
      };

      const initiatorShipResult = await submitToSurat(initiatorOid, initiatorAddress, initiatorUser);
      const receiverShipResult = await submitToSurat(receiverOid, receiverAddress, receiverUser);

      // Shipment heading to the initiator (carrying receiver's items)
      const shipmentToInitiator = await tx.tradeShipment.create({
        data: {
          tradeId,
          shipperId: adminId,
          fromAddressId: warehouseAddressId,
          carrier: initiatorShipResult.carrier,
          trackingNumber: initiatorShipResult.trackingNumber,
          status: ShipmentStatus.label_created,
          shippedAt: now,
          leg: 'from_warehouse',
          recipientType: 'user',
          recipientUserId: trade.initiatorId,
        },
      });

      // Shipment heading to the receiver (carrying initiator's items)
      const shipmentToReceiver = await tx.tradeShipment.create({
        data: {
          tradeId,
          shipperId: adminId,
          fromAddressId: warehouseAddressId,
          carrier: receiverShipResult.carrier,
          trackingNumber: receiverShipResult.trackingNumber,
          status: ShipmentStatus.label_created,
          shippedAt: now,
          leg: 'from_warehouse',
          recipientType: 'user',
          recipientUserId: trade.receiverId,
        },
      });

      const updatedTrade = await tx.trade.update({
        where: { id: tradeId },
        data: {
          status: TradeStatus.shipping_to_recipients,
          updatedAt: now,
        },
      });

      await this.createAuditLog(
        adminId,
        'trade_warehouse_approve',
        'Trade',
        tradeId,
        trade,
        {
          ...updatedTrade,
          notes: dto?.notes ?? null,
          outboundShipments: [shipmentToInitiator.id, shipmentToReceiver.id],
        },
      );

      return {
        initiatorId: trade.initiatorId,
        receiverId: trade.receiverId,
        status: updatedTrade.status,
      };
    });

    // Emit notifications after transaction commits
    try {
      await this.eventService.emitTradeWarehouseApproved({
        tradeId,
        initiatorId: result.initiatorId,
        receiverId: result.receiverId,
        notes: dto?.notes,
      });
    } catch (err) {
      this.logger.error(
        `Failed to emit trade.warehouse-approved for trade ${tradeId}: ${err}`,
      );
    }

    return { success: true, tradeId, status: result.status };
  }

  /**
   * Admin rejects the safe-trade after inspection. Creates two return
   * shipments (each sending each party's own items back to them), sets
   * the trade to `returning`, and triggers a cash refund if applicable.
   */
  async rejectWarehouseTrade(
    adminId: string,
    tradeId: string,
    dto: RejectWarehouseTradeDto,
  ) {
    if (!dto?.reason || !dto.reason.trim()) {
      throw new BadRequestException('Red nedeni zorunludur');
    }

    // Idempotency: if the trade is already `returning` from a prior reject,
    // return the existing result instead of re-running Sürat / refund.
    const existing = await this.prisma.trade.findUnique({
      where: { id: tradeId },
      select: {
        id: true,
        status: true,
        refundFailureReason: true,
        shipments: { where: { leg: 'return' }, select: { id: true } },
      },
    });
    if (!existing) {
      throw new NotFoundException('Takas bulunamadı');
    }
    if (existing.status === TradeStatus.returning && existing.shipments.length >= 2) {
      return {
        success: true,
        tradeId,
        status: existing.status,
        refundFailure: existing.refundFailureReason,
        idempotent: true,
      };
    }

    // 1) Transaction does ONLY DB state mutation: validate, create DRAFT
    //    return shipments, flip status to `returning`. Sürat calls are
    //    deliberately outside the transaction to avoid holding the trade
    //    row lock across a slow third-party API.
    const result = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM trades WHERE id = ${tradeId} FOR UPDATE`;

      const trade = await tx.trade.findUnique({
        where: { id: tradeId },
        include: {
          items: true,
          cashPayment: true,
        },
      });
      if (!trade) {
        throw new NotFoundException('Takas bulunamadı');
      }

      if (
        trade.status !== TradeStatus.at_warehouse &&
        trade.status !== TradeStatus.admin_reviewing
      ) {
        throw new BadRequestException(
          `Takas durumu '${trade.status}' reddetme için uygun değil. Beklenen: at_warehouse veya admin_reviewing.`,
        );
      }

      const [initiatorAddress, receiverAddress] = await Promise.all([
        this.pickTradeSideAddress(tx, trade.initiatorAddressId, trade.initiatorId),
        this.pickTradeSideAddress(tx, trade.receiverAddressId, trade.receiverId),
      ]);
      if (!initiatorAddress) {
        throw new BadRequestException(
          'Takası başlatan kullanıcının kayıtlı adresi yok',
        );
      }
      if (!receiverAddress) {
        throw new BadRequestException(
          'Takası alan kullanıcının kayıtlı adresi yok',
        );
      }

      const warehouseAddressId = await this.resolveWarehouseAddressId(tx);
      const now = new Date();

      const initiatorReturnOid = `TRD-${trade.tradeNumber}-RET-INI`.replace(/[^a-zA-Z0-9-]/g, '').slice(0, 50);
      const receiverReturnOid = `TRD-${trade.tradeNumber}-RET-REC`.replace(/[^a-zA-Z0-9-]/g, '').slice(0, 50);

      // DRAFT rows — carrier/trackingNumber set after the Sürat call returns.
      const returnToInitiator = await tx.tradeShipment.create({
        data: {
          tradeId,
          shipperId: adminId,
          fromAddressId: warehouseAddressId,
          carrier: 'pending',
          trackingNumber: null,
          status: ShipmentStatus.pending,
          leg: 'return',
          recipientType: 'user',
          recipientUserId: trade.initiatorId,
        },
      });
      const returnToReceiver = await tx.tradeShipment.create({
        data: {
          tradeId,
          shipperId: adminId,
          fromAddressId: warehouseAddressId,
          carrier: 'pending',
          trackingNumber: null,
          status: ShipmentStatus.pending,
          leg: 'return',
          recipientType: 'user',
          recipientUserId: trade.receiverId,
        },
      });

      const updatedTrade = await tx.trade.update({
        where: { id: tradeId },
        data: {
          status: TradeStatus.returning,
          cancelReason: dto.reason,
          updatedAt: now,
        },
      });

      await this.createAuditLog(
        adminId,
        'trade_warehouse_reject',
        'Trade',
        tradeId,
        trade,
        {
          ...updatedTrade,
          reason: dto.reason,
          returnShipments: [returnToInitiator.id, returnToReceiver.id],
        },
      );

      const shouldRefund =
        !!trade.cashPayment &&
        trade.cashPayment.status === PaymentStatus.completed;

      return {
        initiatorId: trade.initiatorId,
        receiverId: trade.receiverId,
        status: updatedTrade.status,
        shouldRefund,
        warehouseAddressId,
        returnDrafts: [
          {
            id: returnToInitiator.id,
            oid: initiatorReturnOid,
            address: initiatorAddress,
            recipientUserId: trade.initiatorId,
          },
          {
            id: returnToReceiver.id,
            oid: receiverReturnOid,
            address: receiverAddress,
            recipientUserId: trade.receiverId,
          },
        ],
      };
    });

    // 2) Outside the tx: submit each DRAFT to Sürat. Sürat is idempotent on
    //    OzelKargoTakipNo + idempotencyKey, so a retry after a partial
    //    failure produces the same label without duplicating shipments.
    for (const draft of result.returnDrafts) {
      try {
        const user = await this.prisma.user.findUnique({
          where: { id: draft.recipientUserId },
        });
        const submitted = await this.submitReturnToSuratForReject(
          tradeId,
          draft.oid,
          draft.address,
          user,
        );
        await this.prisma.tradeShipment.update({
          where: { id: draft.id },
          data: {
            carrier: submitted.carrier,
            trackingNumber: submitted.trackingNumber,
            status: ShipmentStatus.label_created,
            shippedAt: new Date(),
          },
        });
      } catch (err: any) {
        this.logger.error(
          `Sürat return submit failed for trade ${tradeId} draft ${draft.id}: ${err?.message}. DRAFT row preserved for retry.`,
        );
      }
    }

    // After commit: refund cash payment (if completed) and notify parties.
    // Refund failure does NOT roll back the reject: return shipments are
    // already on their way back to users. Instead, the failure is persisted
    // on the trade so the admin UI can surface a "retry refund" affordance.
    let refundFailureMessage: string | null = null;
    if (result.shouldRefund) {
      try {
        await this.paymentService.refundTradeCashPaymentIfCompleted(tradeId);
        await this.prisma.trade.update({
          where: { id: tradeId },
          data: { refundFailureReason: null, refundFailureAt: null },
        });
        try {
          const cashPayment = await this.prisma.tradeCashPayment.findUnique({
            where: { tradeId },
            select: { payerId: true },
          });
          await this.eventService.emitTradeRefundCompleted({
            tradeId,
            cashPayerId: cashPayment?.payerId ?? null,
          });
        } catch (emitErr) {
          this.logger.error(
            `Failed to emit trade.refund-completed for trade ${tradeId}: ${emitErr}`,
          );
        }
      } catch (err: any) {
        refundFailureMessage =
          err?.message ?? 'Bilinmeyen hata (PayTR iade başarısız)';
        this.logger.error(
          `refundTradeCashPaymentIfCompleted failed for trade ${tradeId}: ${refundFailureMessage}`,
        );
        try {
          await this.prisma.trade.update({
            where: { id: tradeId },
            data: {
              refundFailureReason: refundFailureMessage.slice(0, 500),
              refundFailureAt: new Date(),
            },
          });
        } catch (persistErr: any) {
          this.logger.error(
            `Failed to persist refund failure for trade ${tradeId}: ${persistErr?.message}`,
          );
        }
        try {
          const cashPayment = await this.prisma.tradeCashPayment.findUnique({
            where: { tradeId },
            select: { payerId: true },
          });
          await this.eventService.emitTradeRefundFailed({
            tradeId,
            cashPayerId: cashPayment?.payerId ?? null,
            reason: refundFailureMessage,
          });
        } catch (emitErr) {
          this.logger.error(
            `Failed to emit trade.refund-failed for trade ${tradeId}: ${emitErr}`,
          );
        }
      }
    }

    try {
      await this.eventService.emitTradeWarehouseRejected({
        tradeId,
        initiatorId: result.initiatorId,
        receiverId: result.receiverId,
        reason: dto.reason,
      });
    } catch (err) {
      this.logger.error(
        `Failed to emit trade.warehouse-rejected for trade ${tradeId}: ${err}`,
      );
    }

    return {
      success: true,
      tradeId,
      status: result.status,
      refundFailure: refundFailureMessage,
    };
  }

  /**
   * Admin marks a return shipment as delivered back to its original owner.
   * When both return shipments are delivered, release any product
   * reservations, re-activate the products, and cancel the trade.
   */
  async markReturnDelivered(
    adminId: string,
    tradeId: string,
    shipmentId: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM trades WHERE id = ${tradeId} FOR UPDATE`;

      const trade = await tx.trade.findUnique({
        where: { id: tradeId },
        select: { id: true, status: true },
      });
      if (!trade) {
        throw new NotFoundException('Takas bulunamadı');
      }

      const shipment = await tx.tradeShipment.findUnique({
        where: { id: shipmentId },
      });
      if (!shipment || shipment.tradeId !== tradeId) {
        throw new NotFoundException('Gönderim bulunamadı');
      }
      if (shipment.leg !== 'return') {
        throw new BadRequestException('Bu gönderim bir iade gönderimi değil');
      }
      if (shipment.deliveredAt) {
        throw new BadRequestException(
          'Bu iade gönderimi zaten teslim edildi olarak işaretlenmiş',
        );
      }

      const now = new Date();
      const updatedShipment = await tx.tradeShipment.update({
        where: { id: shipmentId },
        data: {
          status: ShipmentStatus.delivered,
          deliveredAt: now,
          confirmedAt: now,
        },
      });

      // Check if all return shipments are delivered
      const returnShipments = await tx.tradeShipment.findMany({
        where: { tradeId, leg: 'return' },
        select: { id: true, deliveredAt: true },
      });
      const allDelivered =
        returnShipments.length >= 2 &&
        returnShipments.every((s) => s.deliveredAt !== null);

      let finalStatus: TradeStatus = trade.status;
      if (allDelivered && trade.status !== TradeStatus.cancelled) {
        // Release reservations and reactivate products
        const items = await tx.tradeItem.findMany({
          where: { tradeId },
          select: { productId: true, quantity: true },
        });

        const byProduct = new Map<string, number>();
        for (const item of items) {
          byProduct.set(
            item.productId,
            (byProduct.get(item.productId) ?? 0) + item.quantity,
          );
        }

        for (const [productId, qty] of byProduct) {
          await tx.$queryRaw`SELECT id FROM products WHERE id = ${productId} FOR UPDATE`;
          const prod = await tx.product.findUnique({
            where: { id: productId },
            select: { reservedQuantity: true },
          });
          if (prod) {
            const newReserved = safeDecrementReserved(
              prod.reservedQuantity,
              qty,
            );
            await tx.product.update({
              where: { id: productId },
              data: {
                reservedQuantity: newReserved,
                status:
                  newReserved > 0 ? ProductStatus.reserved : ProductStatus.active,
              },
            });
          }
        }

        await tx.trade.update({
          where: { id: tradeId },
          data: {
            status: TradeStatus.cancelled,
            cancelledAt: now,
            updatedAt: now,
          },
        });
        finalStatus = TradeStatus.cancelled;
      }

      await this.createAuditLog(
        adminId,
        'trade_return_delivered',
        'TradeShipment',
        shipmentId,
        shipment,
        {
          ...updatedShipment,
          allDelivered,
          tradeStatus: finalStatus,
        },
      );

      const parties = await tx.trade.findUnique({
        where: { id: tradeId },
        select: { initiatorId: true, receiverId: true },
      });

      return {
        success: true,
        tradeId,
        shipmentId,
        status: finalStatus,
        allDelivered,
        initiatorId: parties!.initiatorId,
        receiverId: parties!.receiverId,
      };
    }).then(async (res) => {
      if (res.allDelivered && res.status === TradeStatus.cancelled) {
        try {
          await this.eventService.emitTradeReturnCompleted({
            tradeId: res.tradeId,
            initiatorId: res.initiatorId,
            receiverId: res.receiverId,
          });
        } catch (err) {
          this.logger.error(
            `Failed to emit trade.return-completed for trade ${res.tradeId}: ${err}`,
          );
        }
      }
      return {
        success: res.success,
        tradeId: res.tradeId,
        shipmentId: res.shipmentId,
        status: res.status,
        allDelivered: res.allDelivered,
      };
    });
  }

  /**
   * Admin unblocks a `shipping_to_warehouse` trade where one item arrived at
   * the warehouse but the counterpart shipment is stuck in transit. Cancels
   * the stuck counterpart in the carrier, optionally opens a return for the
   * arrived item, transitions the trade to `returning`, and refunds any
   * completed cash payment. Stock reservations release when the return is
   * marked delivered (or immediately if no return shipment is created).
   */
  async forceCancelStuckWarehouseTrade(
    adminId: string,
    tradeId: string,
    dto: { reason: string; sendArrivedItemBack?: boolean },
  ) {
    const reason = dto?.reason?.trim();
    if (!reason || reason.length < 10) {
      throw new BadRequestException(
        'İptal gerekçesi en az 10 karakter olmalıdır',
      );
    }
    const sendArrivedItemBack = dto.sendArrivedItemBack !== false;

    const txResult = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM trades WHERE id = ${tradeId} FOR UPDATE`;

      const trade = await tx.trade.findUnique({
        where: { id: tradeId },
        include: { cashPayment: true },
      });
      if (!trade) {
        throw new NotFoundException('Takas bulunamadı');
      }
      if (trade.status !== TradeStatus.shipping_to_warehouse) {
        throw new BadRequestException(
          `Takas durumu '${trade.status}' force-cancel için uygun değil. Beklenen: shipping_to_warehouse.`,
        );
      }
      if (!trade.firstWarehouseArrivalAt) {
        throw new BadRequestException(
          'Hiçbir ürün depoya ulaşmamış; bu endpoint sadece kısmen ulaşmış takaslar için.',
        );
      }

      const toWarehouseShipments = await tx.tradeShipment.findMany({
        where: { tradeId, leg: 'to_warehouse' },
      });
      const arrived = toWarehouseShipments.find((s) => s.deliveredAt !== null);
      const stuck = toWarehouseShipments.find((s) => s.deliveredAt === null);
      if (!arrived || !stuck) {
        throw new BadRequestException(
          'Hem ulaşmış hem de yolda olan bir kargo bulunamadı; force-cancel için durum uygun değil.',
        );
      }

      const now = new Date();
      let returnShipmentDraft: { id: string; recipientUserId: string; oid: string } | null = null;

      if (sendArrivedItemBack && arrived.recipientUserId === null) {
        // recipientUserId on arrived to_warehouse is the shipper (the original owner).
      }
      if (sendArrivedItemBack) {
        const arrivedOwnerId = arrived.shipperId;
        const warehouseAddressId = await this.resolveWarehouseAddressId(tx);
        const oid = `TRD-${trade.tradeNumber}-RET-STK`
          .replace(/[^a-zA-Z0-9-]/g, '')
          .slice(0, 50);
        const draft = await tx.tradeShipment.create({
          data: {
            tradeId,
            shipperId: adminId,
            fromAddressId: warehouseAddressId,
            carrier: 'pending',
            trackingNumber: null,
            status: ShipmentStatus.pending,
            leg: 'return',
            recipientType: 'user',
            recipientUserId: arrivedOwnerId,
          },
        });
        returnShipmentDraft = { id: draft.id, recipientUserId: arrivedOwnerId, oid };
      }

      await tx.trade.update({
        where: { id: tradeId },
        data: {
          status: returnShipmentDraft ? TradeStatus.returning : TradeStatus.cancelled,
          cancelReason: `Admin force-cancel (stuck): ${reason}`,
          ...(returnShipmentDraft ? {} : { cancelledAt: now }),
          updatedAt: now,
        },
      });

      // Stock release happens on markReturnDelivered (or immediately when no
      // return shipment is created — the items are already with their owners).
      if (!returnShipmentDraft) {
        const items = await tx.tradeItem.findMany({
          where: { tradeId },
          select: { productId: true, quantity: true },
        });
        const byProduct = new Map<string, number>();
        for (const item of items) {
          byProduct.set(item.productId, (byProduct.get(item.productId) ?? 0) + item.quantity);
        }
        for (const [productId, qty] of byProduct) {
          await tx.$queryRaw`SELECT id FROM products WHERE id = ${productId} FOR UPDATE`;
          const prod = await tx.product.findUnique({
            where: { id: productId },
            select: { reservedQuantity: true },
          });
          if (prod) {
            const newReserved = safeDecrementReserved(prod.reservedQuantity, qty);
            await tx.product.update({
              where: { id: productId },
              data: {
                reservedQuantity: newReserved,
                status:
                  newReserved > 0 ? ProductStatus.reserved : ProductStatus.active,
              },
            });
          }
        }
      }

      await this.createAuditLog(
        adminId,
        'trade_force_cancel_stuck',
        'Trade',
        tradeId,
        trade,
        {
          reason,
          stuckShipmentId: stuck.id,
          arrivedShipmentId: arrived.id,
          returnShipmentId: returnShipmentDraft?.id ?? null,
          newStatus: returnShipmentDraft ? 'returning' : 'cancelled',
        },
      );

      return {
        arrivedOwnerId: arrived.shipperId,
        stuckShipment: {
          id: stuck.id,
          trackingNumber: stuck.trackingNumber,
          carrier: stuck.carrier,
        },
        returnShipmentDraft,
        shouldRefund:
          !!trade.cashPayment && trade.cashPayment.status === PaymentStatus.completed,
        warehouseAddressId: returnShipmentDraft
          ? await this.resolveWarehouseAddressId(tx)
          : null,
        initiatorId: trade.initiatorId,
        receiverId: trade.receiverId,
      };
    });

    // Side effects outside the transaction:
    //   1) submit return shipment to Sürat (idempotent),
    //   2) cancel the stuck counterpart shipment at Sürat (best-effort),
    //   3) trigger refund.

    if (txResult.returnShipmentDraft) {
      try {
        const arrivedUser = await this.prisma.user.findUnique({
          where: { id: txResult.arrivedOwnerId },
        });
        const arrivedAddress = await this.prisma.address.findFirst({
          where: { userId: txResult.arrivedOwnerId },
          orderBy: { isDefault: 'desc' },
        });
        if (
          arrivedAddress &&
          this.suratCargoService &&
          this.suratCargoService.isIntegrationEnabled()
        ) {
          const result = await this.suratCargoService.submitShipmentWithRetry({
            idempotencyKey: `surat:trade-stuck-return:${txResult.returnShipmentDraft.oid}`,
            correlationId: `trade-force-cancel-${tradeId}`,
            payload: {
              KisiKurum:
                arrivedAddress.fullName || arrivedUser?.displayName || 'Takas İade',
              SahisBirim: 'Takas Kayıp İade',
              AliciAdresi: arrivedAddress.address,
              Il: normalizeSuratLocation(arrivedAddress.city),
              Ilce: normalizeSuratLocation(arrivedAddress.district),
              TelefonCep: normalizeSuratPhone(arrivedAddress.phone),
              KargoTuru: SuratKargoTuru.Koli,
              OdemeTipi: SuratOdemeTipi.Pesin,
              OzelKargoTakipNo: txResult.returnShipmentDraft.oid,
              Adet: 1,
              BirimDesi: 1,
              BirimKg: 1,
              KapidanOdemeTahsilatTipi: 1,
              TasimaSekli: SuratTasimaSekli.KaraYolu,
              TeslimSekli: SuratTeslimSekli.AdreseTeslim,
              GonderiSekli: SuratGonderiSekli.Standart,
              Pazaryerimi: 0,
              Iademi: true,
            },
          });
          if (result.ok) {
            await this.prisma.tradeShipment.update({
              where: { id: txResult.returnShipmentDraft.id },
              data: {
                carrier: 'surat',
                trackingNumber: txResult.returnShipmentDraft.oid,
                status: ShipmentStatus.label_created,
                shippedAt: new Date(),
              },
            });
          } else {
            const r = result as any;
            const errMsg =
              r.kind === 'business' ? r.suratMessage : `technical: ${r.code}`;
            this.logger.error(
              `Force-cancel return shipment submit failed for trade ${tradeId}: ${errMsg}`,
            );
          }
        } else {
          await this.prisma.tradeShipment.update({
            where: { id: txResult.returnShipmentDraft.id },
            data: {
              carrier: 'Tarodan Warehouse',
              trackingNumber: `TRK${Date.now()
                .toString(36)
                .toUpperCase()}${Math.random()
                .toString(36)
                .substring(2, 6)
                .toUpperCase()}`,
              status: ShipmentStatus.label_created,
              shippedAt: new Date(),
            },
          });
        }
      } catch (err: any) {
        this.logger.error(
          `Force-cancel return submit unexpected error trade=${tradeId}: ${err?.message}`,
        );
      }
    }

    // Cancel the stuck counterpart shipment in Sürat (best-effort).
    if (
      txResult.stuckShipment.carrier === 'surat' &&
      txResult.stuckShipment.trackingNumber &&
      this.suratCargoService &&
      this.suratCargoService.isIntegrationEnabled()
    ) {
      try {
        await this.suratCargoService.cancelShipmentByOrderNumber(
          txResult.stuckShipment.trackingNumber,
        );
        await this.prisma.tradeShipment.update({
          where: { id: txResult.stuckShipment.id },
          data: { status: 'cancelled' as any },
        });
      } catch (err: any) {
        this.logger.error(
          `Force-cancel stuck-shipment Sürat cancel failed trade=${tradeId}: ${err?.message}`,
        );
      }
    }

    if (txResult.shouldRefund) {
      try {
        await this.paymentService.refundTradeCashPaymentIfCompleted(tradeId);
        await this.prisma.trade.update({
          where: { id: tradeId },
          data: { refundFailureReason: null, refundFailureAt: null },
        });
      } catch (err: any) {
        const message =
          err?.message ?? 'Bilinmeyen hata (PayTR iade başarısız)';
        this.logger.error(
          `forceCancelStuckWarehouseTrade refund failed for ${tradeId}: ${message}`,
        );
        try {
          await this.prisma.trade.update({
            where: { id: tradeId },
            data: {
              refundFailureReason: message.slice(0, 500),
              refundFailureAt: new Date(),
            },
          });
        } catch (persistErr: any) {
          this.logger.error(
            `Failed to persist refund failure (force-cancel) trade=${tradeId}: ${persistErr?.message}`,
          );
        }
      }
    }

    return {
      success: true,
      tradeId,
      status: txResult.returnShipmentDraft
        ? TradeStatus.returning
        : TradeStatus.cancelled,
      arrivedOwnerId: txResult.arrivedOwnerId,
      returnShipmentId: txResult.returnShipmentDraft?.id ?? null,
    };
  }

  /**
   * Admin declares a return shipment as lost in transit. Mirrors the
   * markReturnDelivered finalization (stock release + trade cancel) but
   * additionally flags `compensationPendingUserId` on the trade so ops can
   * settle the affected user manually.
   */
  async markReturnShipmentLost(
    adminId: string,
    tradeId: string,
    dto: { shipmentId: string; reason: string; compensateUserId?: string },
  ) {
    const reason = dto?.reason?.trim();
    if (!reason || reason.length < 10) {
      throw new BadRequestException(
        'Kayıp gerekçesi en az 10 karakter olmalıdır',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM trades WHERE id = ${tradeId} FOR UPDATE`;

      const trade = await tx.trade.findUnique({
        where: { id: tradeId },
        select: {
          id: true,
          status: true,
          initiatorId: true,
          receiverId: true,
          compensationPendingUserId: true,
        },
      });
      if (!trade) {
        throw new NotFoundException('Takas bulunamadı');
      }

      const shipment = await tx.tradeShipment.findUnique({
        where: { id: dto.shipmentId },
      });
      if (!shipment || shipment.tradeId !== tradeId) {
        throw new NotFoundException('Gönderim bulunamadı');
      }
      if (shipment.leg !== 'return') {
        throw new BadRequestException(
          'Sadece iade gönderileri kayıp olarak işaretlenebilir',
        );
      }
      if (shipment.deliveredAt) {
        throw new BadRequestException(
          'Bu gönderim zaten teslim edildi; kayıp işaretlenemez',
        );
      }
      if (shipment.lostAt) {
        throw new BadRequestException('Bu gönderim zaten kayıp işaretli');
      }

      const compensationUserId =
        dto.compensateUserId ?? shipment.recipientUserId ?? null;
      if (
        compensationUserId &&
        compensationUserId !== trade.initiatorId &&
        compensationUserId !== trade.receiverId
      ) {
        throw new BadRequestException(
          'Tazminat kullanıcısı bu takasın taraflarından biri olmalı',
        );
      }

      const now = new Date();
      const updatedShipment = await tx.tradeShipment.update({
        where: { id: dto.shipmentId },
        data: {
          status: ShipmentStatus.failed,
          lostAt: now,
          lostReason: reason,
        },
      });

      // If every return shipment has been resolved (delivered or lost),
      // finalize the trade the same way markReturnDelivered would: release
      // reservations, reactivate products, and cancel the trade.
      const returnShipments = await tx.tradeShipment.findMany({
        where: { tradeId, leg: 'return' },
        select: { id: true, deliveredAt: true, lostAt: true },
      });
      const allResolved =
        returnShipments.length >= 2 &&
        returnShipments.every((s) => s.deliveredAt !== null || s.lostAt !== null);

      let finalStatus: TradeStatus = trade.status;
      if (allResolved && trade.status !== TradeStatus.cancelled) {
        const items = await tx.tradeItem.findMany({
          where: { tradeId },
          select: { productId: true, quantity: true },
        });
        const byProduct = new Map<string, number>();
        for (const item of items) {
          byProduct.set(
            item.productId,
            (byProduct.get(item.productId) ?? 0) + item.quantity,
          );
        }
        for (const [productId, qty] of byProduct) {
          await tx.$queryRaw`SELECT id FROM products WHERE id = ${productId} FOR UPDATE`;
          const prod = await tx.product.findUnique({
            where: { id: productId },
            select: { reservedQuantity: true },
          });
          if (prod) {
            const newReserved = safeDecrementReserved(prod.reservedQuantity, qty);
            await tx.product.update({
              where: { id: productId },
              data: {
                reservedQuantity: newReserved,
                status:
                  newReserved > 0 ? ProductStatus.reserved : ProductStatus.active,
              },
            });
          }
        }

        await tx.trade.update({
          where: { id: tradeId },
          data: {
            status: TradeStatus.cancelled,
            cancelledAt: now,
            updatedAt: now,
            ...(compensationUserId
              ? {
                  compensationPendingUserId: compensationUserId,
                  compensationResolvedAt: null,
                }
              : {}),
          },
        });
        finalStatus = TradeStatus.cancelled;
      } else if (compensationUserId) {
        await tx.trade.update({
          where: { id: tradeId },
          data: {
            compensationPendingUserId: compensationUserId,
            compensationResolvedAt: null,
            updatedAt: now,
          },
        });
      }

      await this.createAuditLog(
        adminId,
        'trade_return_shipment_lost',
        'TradeShipment',
        dto.shipmentId,
        shipment,
        {
          ...updatedShipment,
          allResolved,
          tradeStatus: finalStatus,
          compensationUserId,
          reason,
        },
      );

      return {
        success: true,
        tradeId,
        shipmentId: dto.shipmentId,
        status: finalStatus,
        compensationUserId,
        reason,
      };
    }).then(async (res) => {
      try {
        await this.eventService.emitTradeReturnLost({
          tradeId: res.tradeId,
          compensationUserId: res.compensationUserId,
          reason: res.reason,
        });
      } catch (err) {
        this.logger.error(
          `Failed to emit trade.return-lost for trade ${res.tradeId}: ${err}`,
        );
      }
      return {
        success: res.success,
        tradeId: res.tradeId,
        shipmentId: res.shipmentId,
        status: res.status,
        compensationUserId: res.compensationUserId,
      };
    });
  }

  /**
   * Admin closes a pending compensation flag after settling the user out of
   * band. Sets `compensationResolvedAt` so the banner disappears in the UI.
   */
  // ==================== REFUND REQUEST ADMIN ====================

  /**
   * List refund requests for admin operations queue.
   */
  async listRefundRequests(query: {
    status?: import('@prisma/client').RefundRequestStatus[];
    userSearch?: string;
    from?: string;
    to?: string;
    page?: number;
    limit?: number;
  }) {
    const page = query.page ?? 1;
    const limit = Math.min(query.limit ?? 20, 100);
    const where: Prisma.RefundRequestWhereInput = {};
    if (query.status && query.status.length > 0) {
      where.status = { in: query.status };
    }
    if (query.from || query.to) {
      where.createdAt = {};
      if (query.from) where.createdAt.gte = new Date(query.from);
      if (query.to) where.createdAt.lte = new Date(query.to);
    }
    if (query.userSearch && query.userSearch.trim().length > 0) {
      const term = query.userSearch.trim();
      where.OR = [
        { requester: { displayName: { contains: term, mode: 'insensitive' } } },
        { requester: { email: { contains: term, mode: 'insensitive' } } },
        { order: { seller: { displayName: { contains: term, mode: 'insensitive' } } } },
        { order: { seller: { email: { contains: term, mode: 'insensitive' } } } },
        { refundNumber: { contains: term, mode: 'insensitive' } },
      ];
    }

    const [items, total] = await Promise.all([
      this.prisma.refundRequest.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          requester: { select: { id: true, displayName: true, email: true } },
          order: {
            select: {
              id: true,
              orderNumber: true,
              totalAmount: true,
              seller: { select: { id: true, displayName: true, email: true } },
              product: { select: { id: true, title: true } },
            },
          },
        },
      }),
      this.prisma.refundRequest.count({ where }),
    ]);
    return { items, total, page, limit };
  }

  async getRefundRequestDetail(refundRequestId: string) {
    const rr = await this.prisma.refundRequest.findUnique({
      where: { id: refundRequestId },
      include: {
        requester: {
          select: { id: true, displayName: true, email: true, phone: true },
        },
        order: {
          include: {
            seller: {
              select: { id: true, displayName: true, email: true, phone: true },
            },
            product: { include: { images: { orderBy: { sortOrder: 'asc' } } } },
            payment: true,
            shipment: true,
          },
        },
      },
    });
    if (!rr) throw new NotFoundException('İade talebi bulunamadı');
    return rr;
  }

  /**
   * Admin resolves a disputed refund: either approves (opens return shipment)
   * or rejects (closes the request without refund).
   */
  async resolveRefundDispute(
    adminId: string,
    refundRequestId: string,
    dto: { resolution: 'approve' | 'reject'; notes: string },
  ) {
    const notes = dto?.notes?.trim();
    if (!notes || notes.length < 10) {
      throw new BadRequestException('Çözüm notu en az 10 karakter olmalıdır');
    }

    const rr = await this.prisma.refundRequest.findUnique({
      where: { id: refundRequestId },
      include: { order: true },
    });
    if (!rr) throw new NotFoundException('İade talebi bulunamadı');
    if (rr.status !== 'disputed') {
      throw new BadRequestException(
        `Talep durumu '${rr.status}' itiraz çözümü için uygun değil. Beklenen: disputed`,
      );
    }

    const previousMetadata = (rr.metadata as Record<string, any>) || {};
    const history = Array.isArray(previousMetadata.history)
      ? previousMetadata.history
      : [];

    if (dto.resolution === 'approve') {
      // Approve → open return shipment (state geçişi RefundService içinde)
      await this.refundService.openReturnShipment(rr.id);
      await this.prisma.refundRequest.update({
        where: { id: rr.id },
        data: {
          decidedBy: adminId,
          decidedAt: new Date(),
          metadata: {
            ...previousMetadata,
            history: [
              ...history,
              {
                action: 'dispute_resolved_approve',
                by: adminId,
                at: new Date().toISOString(),
                details: { notes },
              },
            ],
          },
        },
      });
      await this.createAuditLog(
        adminId,
        'refund_dispute_resolve_approve',
        'RefundRequest',
        rr.id,
        { status: rr.status },
        { resolution: 'approve', notes },
      );
      return { success: true, refundRequestId: rr.id, resolution: 'approve' };
    }

    // Reject: status → rejected, audit + buyer notification
    const updated = await this.prisma.refundRequest.update({
      where: { id: rr.id },
      data: {
        status: 'rejected',
        decidedBy: adminId,
        decidedAt: new Date(),
        sellerResponse: rr.sellerResponse ?? notes,
        metadata: {
          ...previousMetadata,
          history: [
            ...history,
            {
              action: 'dispute_resolved_reject',
              by: adminId,
              at: new Date().toISOString(),
              details: { notes },
            },
          ],
        },
      },
    });
    await this.createAuditLog(
      adminId,
      'refund_dispute_resolve_reject',
      'RefundRequest',
      rr.id,
      { status: rr.status },
      { resolution: 'reject', notes },
    );
    try {
      await this.notificationService.createInAppNotification(
        rr.requesterId,
        NotificationType.REFUND_REJECTED,
        {
          refundNumber: rr.refundNumber,
          orderId: rr.orderId,
          reason: notes,
        },
      );
    } catch (err: any) {
      this.logger.error(
        `REFUND_REJECTED notification failed for ${rr.id}: ${err?.message}`,
      );
    }
    return {
      success: true,
      refundRequestId: rr.id,
      resolution: 'reject',
      status: updated.status,
    };
  }

  /**
   * Force-finalize a refund stuck in `return_delivered`: call the existing
   * finalize logic + audit log. Idempotent (finalizeRefundForReturnedShipment
   * returns the row unchanged if already refunded).
   */
  async forceFinalizeRefund(adminId: string, refundRequestId: string) {
    const rr = await this.prisma.refundRequest.findUnique({
      where: { id: refundRequestId },
      select: { id: true, status: true, refundedAt: true },
    });
    if (!rr) throw new NotFoundException('İade talebi bulunamadı');
    if (rr.refundedAt) {
      throw new BadRequestException('Bu iade zaten tamamlanmış');
    }
    if (rr.status !== 'return_delivered') {
      throw new BadRequestException(
        `Talep durumu '${rr.status}' force-finalize için uygun değil. Beklenen: return_delivered`,
      );
    }
    const result = await this.refundService.finalizeRefundForReturnedShipment(
      rr.id,
    );
    await this.createAuditLog(
      adminId,
      'refund_force_finalize',
      'RefundRequest',
      rr.id,
      { previousStatus: rr.status },
      { newStatus: result.status, providerRefundId: result.providerRefundId },
    );
    return { success: true, refundRequestId: rr.id, status: result.status };
  }

  async resolveTradeCompensation(adminId: string, tradeId: string, note?: string) {
    const trade = await this.prisma.trade.findUnique({
      where: { id: tradeId },
      select: {
        id: true,
        compensationPendingUserId: true,
        compensationResolvedAt: true,
      },
    });
    if (!trade) {
      throw new NotFoundException('Takas bulunamadı');
    }
    if (!trade.compensationPendingUserId) {
      throw new BadRequestException('Bu takasta açık tazminat işareti yok');
    }
    if (trade.compensationResolvedAt) {
      throw new BadRequestException('Tazminat zaten kapatılmış');
    }

    const now = new Date();
    await this.prisma.trade.update({
      where: { id: tradeId },
      data: { compensationResolvedAt: now },
    });

    await this.createAuditLog(
      adminId,
      'trade_compensation_resolved',
      'Trade',
      tradeId,
      { compensationPendingUserId: trade.compensationPendingUserId },
      { resolvedAt: now, note: note ?? null },
    );

    return { success: true, tradeId, resolvedAt: now };
  }

  /**
   * Admin manually retries a PayTR refund that failed during
   * `rejectWarehouseTrade` (or a previous retry). On success the failure
   * markers on the trade are cleared; on repeated failure the marker is
   * refreshed with the new error message.
   */
  async retryTradeRefund(adminId: string, tradeId: string) {
    const trade = await this.prisma.trade.findUnique({
      where: { id: tradeId },
      select: {
        id: true,
        status: true,
        refundFailureReason: true,
        refundFailureAt: true,
        cashPayment: {
          select: { id: true, status: true },
        },
      },
    });
    if (!trade) {
      throw new NotFoundException('Takas bulunamadı');
    }

    if (!trade.cashPayment || trade.cashPayment.status !== PaymentStatus.completed) {
      throw new BadRequestException(
        'İade edilebilecek tamamlanmış bir nakit ödeme yok',
      );
    }

    const eligibleStatuses: TradeStatus[] = [
      TradeStatus.returning,
      TradeStatus.cancelled,
      TradeStatus.disputed,
    ];
    if (!eligibleStatuses.includes(trade.status)) {
      throw new BadRequestException(
        `Takas durumu '${trade.status}' iade yeniden denemesi için uygun değil`,
      );
    }

    if (!trade.refundFailureReason) {
      throw new BadRequestException(
        'Bu takasta kayıtlı bir iade hatası yok; yeniden deneme gerekmiyor',
      );
    }

    const cashPayment = await this.prisma.tradeCashPayment.findUnique({
      where: { tradeId },
      select: { payerId: true },
    });

    try {
      const result = await this.paymentService.refundTradeCashPaymentIfCompleted(tradeId);
      await this.prisma.trade.update({
        where: { id: tradeId },
        data: { refundFailureReason: null, refundFailureAt: null },
      });
      await this.createAuditLog(
        adminId,
        'trade_refund_retry_success',
        'Trade',
        tradeId,
        {
          previousFailureReason: trade.refundFailureReason,
          previousFailureAt: trade.refundFailureAt,
        },
        result,
      );
      try {
        await this.eventService.emitTradeRefundCompleted({
          tradeId,
          cashPayerId: cashPayment?.payerId ?? null,
        });
      } catch (emitErr) {
        this.logger.error(
          `Failed to emit trade.refund-completed for trade ${tradeId}: ${emitErr}`,
        );
      }
      return { success: true, tradeId, refunded: result.refunded, skippedReason: result.skippedReason };
    } catch (err: any) {
      const message = err?.message ?? 'Bilinmeyen hata (PayTR iade başarısız)';
      this.logger.error(
        `retryTradeRefund failed for trade ${tradeId}: ${message}`,
      );
      try {
        await this.prisma.trade.update({
          where: { id: tradeId },
          data: {
            refundFailureReason: message.slice(0, 500),
            refundFailureAt: new Date(),
          },
        });
      } catch (persistErr: any) {
        this.logger.error(
          `Failed to persist refund retry failure for trade ${tradeId}: ${persistErr?.message}`,
        );
      }
      await this.createAuditLog(
        adminId,
        'trade_refund_retry_failure',
        'Trade',
        tradeId,
        {
          previousFailureReason: trade.refundFailureReason,
          previousFailureAt: trade.refundFailureAt,
        },
        { message },
      );
      try {
        await this.eventService.emitTradeRefundFailed({
          tradeId,
          cashPayerId: cashPayment?.payerId ?? null,
          reason: message,
        });
      } catch (emitErr) {
        this.logger.error(
          `Failed to emit trade.refund-failed for trade ${tradeId}: ${emitErr}`,
        );
      }
      throw err;
    }
  }

  // ==================== MESSAGE MANAGEMENT ====================

  /**
   * Get messages for admin moderation
   */
  async getMessages(query: {
    status?: MessageStatus;
    fromDate?: string;
    toDate?: string;
    page?: number;
    limit?: number;
  }) {
    const { status, fromDate, toDate, page = 1, limit = 20 } = query;

    const where: Prisma.MessageWhereInput = {};

    // Only filter by status when explicitly provided (e.g. "Tümü" = no status = all messages)
    if (status != null) {
      where.status = status;
    }

    if (fromDate || toDate) {
      where.createdAt = {};
      if (fromDate) {
        where.createdAt.gte = new Date(fromDate);
      }
      if (toDate) {
        where.createdAt.lte = new Date(toDate);
      }
    }

    const [total, messages] = await Promise.all([
      this.prisma.message.count({ where }),
      this.prisma.message.findMany({
        where,
        include: {
          sender: { select: { id: true, displayName: true, email: true } },
          receiver: { select: { id: true, displayName: true, email: true } },
          thread: { select: { id: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return {
      data: messages,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  /**
   * Get message by ID for admin
   */
  async getMessageById(messageId: string) {
    const message = await this.prisma.message.findUnique({
      where: { id: messageId },
      include: {
        sender: {
          select: {
            id: true,
            displayName: true,
            email: true,
            phone: true,
          },
        },
        receiver: {
          select: {
            id: true,
            displayName: true,
            email: true,
            phone: true,
          },
        },
        thread: {
          include: {
            messages: {
              orderBy: { createdAt: 'asc' },
              take: 50, // Last 50 messages in thread
            },
          },
        },
      },
    });

    if (!message) {
      throw new NotFoundException('Mesaj bulunamadı');
    }

    return message;
  }

  /**
   * Approve message
   */
  async approveMessage(adminId: string, messageId: string, notes?: string) {
    const message = await this.prisma.message.findUnique({
      where: { id: messageId },
    });

    if (!message) {
      throw new NotFoundException('Mesaj bulunamadı');
    }

    // Use MessagingService to approve
    const result = await this.messagingService.moderateMessage(messageId, adminId, 'approve');

    // Create audit log
    await this.createAuditLog(adminId, 'message_approve', 'Message', messageId, message, {
      ...result,
      notes,
    });

    return { success: true, messageId, status: 'approved' };
  }

  /**
   * Reject message
   */
  async rejectMessage(adminId: string, messageId: string, reason: string) {
    const message = await this.prisma.message.findUnique({
      where: { id: messageId },
    });

    if (!message) {
      throw new NotFoundException('Mesaj bulunamadı');
    }

    // Use MessagingService to reject
    await this.messagingService.moderateMessage(messageId, adminId, 'reject');

    // Create audit log
    await this.createAuditLog(adminId, 'message_reject', 'Message', messageId, message, {
      reason,
    });

    return { success: true, messageId, status: 'rejected', reason };
  }

  // ==================== SUPPORT TICKET MANAGEMENT ====================

  /**
   * Get support tickets with filters for admin
   */
  async getSupportTickets(query: {
    status?: TicketStatus;
    priority?: TicketPriority;
    category?: TicketCategory;
    assigneeId?: string;
    creatorId?: string;
    fromDate?: string;
    toDate?: string;
    page?: number;
    limit?: number;
  }) {
    const { status, priority, category, assigneeId, creatorId, fromDate, toDate, page = 1, limit = 20 } = query;

    // Use SupportService's getAllTickets method
    const result = await this.supportService.getAllTickets(
      page,
      limit,
      status,
      priority,
      category,
      assigneeId,
    );

    // Filter by creatorId and date range if provided
    let filteredTickets = result.tickets;

    if (creatorId) {
      filteredTickets = filteredTickets.filter((t) => t.creatorId === creatorId);
    }

    if (fromDate || toDate) {
      const from = fromDate ? new Date(fromDate) : null;
      const to = toDate ? new Date(toDate) : null;
      filteredTickets = filteredTickets.filter((t) => {
        const createdAt = new Date(t.createdAt);
        if (from && createdAt < from) return false;
        if (to && createdAt > to) return false;
        return true;
      });
    }

    return {
      data: filteredTickets,
      meta: {
        total: filteredTickets.length,
        page,
        limit,
        totalPages: Math.ceil(filteredTickets.length / limit),
      },
    };
  }

  /**
   * Get support ticket by ID for admin
   */
  async getSupportTicketById(ticketId: string) {
    // Use SupportService's getTicketById with admin flag
    // Pass empty string for userId since admin can view any ticket
    return this.supportService.getTicketById(ticketId, '', true);
  }

  /**
   * Update support ticket
   */
  async updateSupportTicket(adminId: string, ticketId: string, dto: {
    status?: TicketStatus;
    priority?: TicketPriority;
    assigneeId?: string;
    note?: string;
  }) {
    const ticket = await this.prisma.supportTicket.findUnique({
      where: { id: ticketId },
    });

    if (!ticket) {
      throw new NotFoundException('Destek talebi bulunamadı');
    }

    const oldTicket = { ...ticket };

    // Update status if provided
    if (dto.status) {
      await this.supportService.updateTicketStatus(ticketId, adminId, {
        status: dto.status,
        note: dto.note,
      });
    }

    // Update priority if provided
    if (dto.priority) {
      await this.supportService.updatePriority(ticketId, dto.priority);
    }

    // Update assignee if provided
    if (dto.assigneeId !== undefined) {
      await this.supportService.assignTicket(ticketId, { assigneeId: dto.assigneeId });
    }

    const updatedTicket = await this.prisma.supportTicket.findUnique({
      where: { id: ticketId },
    });

    // Create audit log
    await this.createAuditLog(adminId, 'support_ticket_update', 'SupportTicket', ticketId, oldTicket, updatedTicket);

    return this.getSupportTicketById(ticketId);
  }

  /**
   * Reply to support ticket
   */
  async replyToSupportTicket(adminId: string, ticketId: string, message: string) {
    const ticket = await this.prisma.supportTicket.findUnique({
      where: { id: ticketId },
    });

    if (!ticket) {
      throw new NotFoundException('Destek talebi bulunamadı');
    }

    // Use SupportService's addMessage with admin flag
    await this.supportService.addMessage(ticketId, adminId, { content: message }, true);

    // Update status to in_progress if it was waiting_customer
    if (ticket.status === TicketStatus.waiting_customer) {
      await this.supportService.updateTicketStatus(ticketId, adminId, {
        status: TicketStatus.in_progress,
      });
    }

    // Create audit log
    await this.createAuditLog(adminId, 'support_ticket_reply', 'SupportTicket', ticketId, ticket, {
      ...ticket,
      message,
    });

    return this.getSupportTicketById(ticketId);
  }

  // ==================== CATEGORY MANAGEMENT ====================

  /**
   * Generate slug from name
   */
  private generateSlug(name: string): string {
    return name
      .toLowerCase()
      .trim()
      .replace(/[^\w\s-]/g, '')
      .replace(/[\s_-]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  /**
   * Get categories with tree structure
   */
  async getCategories() {
    const categories = await this.prisma.category.findMany({
      include: {
        parent: true,
        children: { orderBy: { name: 'asc' } },
        _count: {
          select: { products: true, collections: true },
        },
      },
      orderBy: { name: 'asc' },
    });

    return {
      data: categories.map((c) => ({
        id: c.id,
        name: c.name,
        slug: c.slug,
        description: c.description,
        parentId: c.parentId,
        parent: c.parent ? { id: c.parent.id, name: c.parent.name } : null,
        children: c.children.map((child) => ({
          id: child.id,
          name: child.name,
          slug: child.slug,
        })),
        sortOrder: c.sortOrder,
        isActive: c.isActive,
        productCount: c._count.products,
        collectionCount: c._count.collections,
        createdAt: c.createdAt,
      })),
    };
  }

  /**
   * Create category
   */
  async createCategory(adminId: string, dto: {
    name: string;
    description?: string;
    parentId?: string;
    sortOrder?: number;
    isActive?: boolean;
  }) {
    // Check if parent exists
    if (dto.parentId) {
      const parent = await this.prisma.category.findUnique({
        where: { id: dto.parentId },
      });

      if (!parent) {
        throw new NotFoundException('Üst kategori bulunamadı');
      }
    }

    // Generate slug
    let slug = this.generateSlug(dto.name);
    let slugExists = await this.prisma.category.findUnique({
      where: { slug },
    });

    // If slug exists, append number
    let counter = 1;
    while (slugExists) {
      slug = `${this.generateSlug(dto.name)}-${counter}`;
      slugExists = await this.prisma.category.findUnique({
        where: { slug },
      });
      counter++;
    }

    const category = await this.prisma.category.create({
      data: {
        name: dto.name,
        slug,
        description: dto.description || null,
        parentId: dto.parentId || null, // Empty string becomes null (root category)
        sortOrder: dto.sortOrder || 0,
        isActive: dto.isActive !== undefined ? dto.isActive : true,
      },
    });

    // Create audit log
    await this.createAuditLog(adminId, 'category_create', 'Category', category.id, null, category);

    return category;
  }

  /**
   * Update category
   */
  async updateCategory(adminId: string, categoryId: string, dto: {
    name?: string;
    description?: string;
    parentId?: string;
    sortOrder?: number;
    isActive?: boolean;
  }) {
    const category = await this.prisma.category.findUnique({
      where: { id: categoryId },
      include: { children: true },
    });

    if (!category) {
      throw new NotFoundException('Kategori bulunamadı');
    }

    // Check circular reference if parentId is being changed
    if (dto.parentId && dto.parentId !== category.parentId) {
      // Check if new parent is a child of this category
      const isChild = category.children.some((child) => child.id === dto.parentId);
      if (isChild) {
        throw new BadRequestException('Kategori kendi alt kategorisini üst kategori olarak seçemez');
      }

      // Check if new parent exists
      const newParent = await this.prisma.category.findUnique({
        where: { id: dto.parentId },
      });

      if (!newParent) {
        throw new NotFoundException('Üst kategori bulunamadı');
      }
    }

    // Generate new slug if name changed
    let slug = category.slug;
    if (dto.name && dto.name !== category.name) {
      slug = this.generateSlug(dto.name);
      const slugExists = await this.prisma.category.findUnique({
        where: { slug },
      });

      if (slugExists && slugExists.id !== categoryId) {
        // Slug exists for another category, append number
        let counter = 1;
        while (slugExists) {
          slug = `${this.generateSlug(dto.name)}-${counter}`;
          const check = await this.prisma.category.findUnique({
            where: { slug },
          });
          if (!check || check.id === categoryId) break;
          counter++;
        }
      }
    }

    const oldCategory = { ...category };
    const updatedCategory = await this.prisma.category.update({
      where: { id: categoryId },
      data: {
        name: dto.name,
        slug,
        description: dto.description !== undefined ? (dto.description || null) : undefined,
        parentId: dto.parentId !== undefined ? (dto.parentId || null) : undefined, // Empty string becomes null
        sortOrder: dto.sortOrder,
        isActive: dto.isActive,
      },
    });

    // Create audit log
    await this.createAuditLog(adminId, 'category_update', 'Category', categoryId, oldCategory, updatedCategory);

    return updatedCategory;
  }

  /**
   * Delete category
   */
  async deleteCategory(adminId: string, categoryId: string) {
    const category = await this.prisma.category.findUnique({
      where: { id: categoryId },
      include: {
        children: true,
        _count: {
          select: { products: true },
        },
      },
    });

    if (!category) {
      throw new NotFoundException('Kategori bulunamadı');
    }

    // Check if category has products
    if (category._count.products > 0) {
      throw new BadRequestException('Bu kategoride ürünler bulunmaktadır. Önce ürünleri başka kategoriye taşıyın.');
    }

    // Check if category has children
    if (category.children.length > 0) {
      throw new BadRequestException('Bu kategorinin alt kategorileri bulunmaktadır. Önce alt kategorileri silin.');
    }

    await this.prisma.category.delete({
      where: { id: categoryId },
    });

    // Create audit log
    await this.createAuditLog(adminId, 'category_delete', 'Category', categoryId, category, null);

    return { success: true, categoryId };
  }

  // ==================== STATIC PAGES ====================

  async getPages() {
    const pages = await this.prisma.staticPage.findMany({
      orderBy: [{ sortOrder: 'asc' }, { title: 'asc' }],
    });
    return {
      data: pages.map((p) => ({
        id: p.id,
        slug: p.slug,
        title: p.title,
        metaTitle: p.metaTitle,
        metaDescription: p.metaDescription ? p.metaDescription.slice(0, 100) : null,
        isPublished: p.isPublished,
        sortOrder: p.sortOrder,
        createdAt: p.createdAt,
        updatedAt: p.updatedAt,
      })),
    };
  }

  async getPageById(id: string) {
    const page = await this.prisma.staticPage.findUnique({ where: { id } });
    if (!page) throw new NotFoundException('Sayfa bulunamadı');
    return page;
  }

  async getPageBySlug(slug: string) {
    const page = await this.prisma.staticPage.findUnique({ where: { slug } });
    if (!page) throw new NotFoundException('Sayfa bulunamadı');
    return page;
  }

  async createPage(adminId: string, dto: CreateStaticPageDto) {
    const existing = await this.prisma.staticPage.findUnique({ where: { slug: dto.slug } });
    if (existing) throw new BadRequestException('Bu slug zaten kullanılıyor');
    const page = await this.prisma.staticPage.create({
      data: {
        slug: dto.slug.trim().toLowerCase().replace(/\s+/g, '-'),
        title: dto.title,
        content: dto.content,
        metaTitle: dto.metaTitle ?? null,
        metaDescription: dto.metaDescription ?? null,
        metaKeywords: dto.metaKeywords ?? null,
        isPublished: dto.isPublished ?? true,
        sortOrder: dto.sortOrder ?? 0,
      },
    });
    await this.createAuditLog(adminId, 'static_page_create', 'StaticPage', page.id, null, page);
    return page;
  }

  async updatePage(adminId: string, id: string, dto: UpdateStaticPageDto) {
    const existing = await this.prisma.staticPage.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Sayfa bulunamadı');
    if (dto.slug && dto.slug !== existing.slug) {
      const duplicate = await this.prisma.staticPage.findUnique({ where: { slug: dto.slug } });
      if (duplicate) throw new BadRequestException('Bu slug zaten kullanılıyor');
    }
    const page = await this.prisma.staticPage.update({
      where: { id },
      data: {
        ...(dto.slug != null && { slug: dto.slug.trim().toLowerCase().replace(/\s+/g, '-') }),
        ...(dto.title != null && { title: dto.title }),
        ...(dto.content != null && { content: dto.content }),
        ...(dto.metaTitle !== undefined && { metaTitle: dto.metaTitle || null }),
        ...(dto.metaDescription !== undefined && { metaDescription: dto.metaDescription || null }),
        ...(dto.metaKeywords !== undefined && { metaKeywords: dto.metaKeywords || null }),
        ...(dto.isPublished != null && { isPublished: dto.isPublished }),
        ...(dto.sortOrder != null && { sortOrder: dto.sortOrder }),
      },
    });
    await this.createAuditLog(adminId, 'static_page_update', 'StaticPage', id, existing, page);
    return page;
  }

  async deletePage(adminId: string, id: string) {
    const page = await this.prisma.staticPage.findUnique({ where: { id } });
    if (!page) throw new NotFoundException('Sayfa bulunamadı');
    await this.prisma.staticPage.delete({ where: { id } });
    await this.createAuditLog(adminId, 'static_page_delete', 'StaticPage', id, page, null);
    return { success: true };
  }

  // ==================== EMAIL TEMPLATES ====================

  private readonly EMAIL_TEMPLATE_KEYS: Array<{ key: string; name: string }> = [
    { key: 'welcome', name: 'Hoş geldin' },
    { key: 'order-confirmation', name: 'Sipariş onayı' },
    { key: 'order-paid', name: 'Ödeme alındı (alıcı)' },
    { key: 'order-paid-seller', name: 'Yeni sipariş (satıcı)' },
    { key: 'order-shipped', name: 'Kargoya verildi' },
    { key: 'order-delivered', name: 'Teslim edildi' },
    { key: 'password-reset', name: 'Şifre sıfırlama' },
    { key: 'offer-received', name: 'Yeni teklif' },
    { key: 'offer-accepted', name: 'Teklif kabul edildi' },
    { key: 'wishlist-price-change', name: 'Fiyat değişimi (istek listesi)' },
    { key: 'marketing-newsletter', name: 'Haftalık bülten' },
    { key: 'marketing-monthly', name: 'Aylık fırsatlar' },
  ];

  substituteVariables(text: string, data: Record<string, any>): string {
    if (!text) return text;
    return text.replace(/\{\{(\w+)\}\}/g, (_, key) => {
      const val = data[key];
      return val != null ? String(val) : `{{${key}}}`;
    });
  }

  async getEmailTemplates() {
    const dbTemplates = await this.prisma.emailTemplate.findMany();
    const dbMap = new Map(dbTemplates.map((t) => [t.key, t]));
    const list = this.EMAIL_TEMPLATE_KEYS.map(({ key, name }) => {
      const db = dbMap.get(key);
      return {
        key,
        name: db?.name ?? name,
        subject: db?.subject ?? null,
        hasCustomBody: !!db?.bodyHtml,
        variablesJson: db?.variablesJson,
        updatedAt: db?.updatedAt ?? null,
      };
    });
    return { data: list };
  }

  async getEmailTemplate(key: string) {
    const db = await this.prisma.emailTemplate.findUnique({ where: { key } });
    const meta = this.EMAIL_TEMPLATE_KEYS.find((m) => m.key === key);
    if (!meta && !db) throw new NotFoundException('Şablon bulunamadı');
    return {
      key,
      name: db?.name ?? meta?.name ?? key,
      subject: db?.subject ?? null,
      bodyHtml: db?.bodyHtml ?? null,
      variablesJson: db?.variablesJson ?? null,
      isCustom: !!db,
    };
  }

  async updateEmailTemplate(adminId: string, key: string, dto: UpdateEmailTemplateDto) {
    const meta = this.EMAIL_TEMPLATE_KEYS.find((m) => m.key === key);
    if (!meta) throw new NotFoundException('Geçersiz şablon anahtarı');
    const existing = await this.prisma.emailTemplate.findUnique({ where: { key } });
    const data = {
      name: dto.name ?? meta.name,
      subject: dto.subject ?? existing?.subject ?? '',
      bodyHtml: dto.bodyHtml ?? existing?.bodyHtml ?? '',
      variablesJson: dto.variablesJson ?? existing?.variablesJson ?? null,
    };
    const template = await this.prisma.emailTemplate.upsert({
      where: { key },
      create: { key, ...data },
      update: data,
    });
    await this.createAuditLog(adminId, 'email_template_update', 'EmailTemplate', template.id, existing, template);
    return template;
  }

  async previewEmailTemplate(key: string, templateData?: Record<string, any>) {
    const db = await this.prisma.emailTemplate.findUnique({ where: { key } });
    const sample = templateData || {
      name: 'Örnek Kullanıcı',
      buyerName: 'Alıcı',
      sellerName: 'Satıcı',
      orderNumber: 'TRD-12345',
      orderId: 'sample-order-id',
      productTitle: 'Örnek Ürün',
      totalAmount: 199.99,
      verifyUrl: 'https://example.com/verify',
      resetUrl: 'https://example.com/reset',
    };
    if (db) {
      return {
        subject: this.substituteVariables(db.subject, sample),
        html: this.substituteVariables(db.bodyHtml, sample),
      };
    }
    return { subject: '(Varsayılan şablon)', html: '<p>Bu şablon için özel içerik kaydedilmemiş. Düzenleyerek özelleştirebilirsiniz.</p>' };
  }

  async sendTestEmail(key: string, dto: { to: string; templateData?: Record<string, any> }) {
    await this.eventService.queueEmail({
      to: dto.to,
      template: key,
      subject: '',
      templateData: dto.templateData || {},
    });
    return { success: true, message: 'Test e-postası kuyruğa eklendi' };
  }

  // ==================== TAX SETTINGS (Regions, Rates, Rules, Reporting) ====================
  /** Prisma client with Tax models; at runtime may be missing until prisma generate is run */
  private get taxPrisma(): any {
    return this.prisma as any;
  }

  private get hasTaxModels(): boolean {
    return !!(this.taxPrisma.taxRegion && this.taxPrisma.taxRate && this.taxPrisma.taxRule);
  }

  async getTaxRegions() {
    if (!this.hasTaxModels) return { data: [] };
    const regions = await this.taxPrisma.taxRegion.findMany({
      include: {
        _count: { select: { taxRates: true, taxRules: true } },
      },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
    return {
      data: regions.map((r: any) => ({
        id: r.id,
        name: r.name,
        countryCode: r.countryCode,
        regionCode: r.regionCode,
        isDefault: r.isDefault,
        sortOrder: r.sortOrder,
        isActive: r.isActive,
        ratesCount: r._count.taxRates,
        rulesCount: r._count.taxRules,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
      })),
    };
  }

  async createTaxRegion(adminId: string, dto: {
    name: string;
    countryCode: string;
    regionCode?: string;
    isDefault?: boolean;
    sortOrder?: number;
    isActive?: boolean;
  }) {
    if (!this.hasTaxModels) throw new BadRequestException('Tax models not available. Run: npx prisma generate (in apps/api)');
    if (dto.isDefault) {
      await this.taxPrisma.taxRegion.updateMany({ data: { isDefault: false } });
    }
    const region = await this.taxPrisma.taxRegion.create({
      data: {
        name: dto.name,
        countryCode: dto.countryCode.toUpperCase(),
        regionCode: dto.regionCode ?? null,
        isDefault: dto.isDefault ?? false,
        sortOrder: dto.sortOrder ?? 0,
        isActive: dto.isActive ?? true,
      },
    });
    await this.createAuditLog(adminId, 'tax_region_create', 'TaxRegion', region.id, null, region);
    return region;
  }

  async updateTaxRegion(adminId: string, id: string, dto: {
    name?: string;
    countryCode?: string;
    regionCode?: string;
    isDefault?: boolean;
    sortOrder?: number;
    isActive?: boolean;
  }) {
    if (!this.hasTaxModels) throw new BadRequestException('Tax models not available. Run: npx prisma generate (in apps/api)');
    const existing = await this.taxPrisma.taxRegion.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Vergi bölgesi bulunamadı');
    if (dto.isDefault) {
      await this.taxPrisma.taxRegion.updateMany({ data: { isDefault: false } });
    }
    const region = await this.taxPrisma.taxRegion.update({
      where: { id },
      data: {
        ...(dto.name != null && { name: dto.name }),
        ...(dto.countryCode != null && { countryCode: dto.countryCode.toUpperCase() }),
        ...(dto.regionCode !== undefined && { regionCode: dto.regionCode || null }),
        ...(dto.isDefault != null && { isDefault: dto.isDefault }),
        ...(dto.sortOrder != null && { sortOrder: dto.sortOrder }),
        ...(dto.isActive != null && { isActive: dto.isActive }),
      },
    });
    await this.createAuditLog(adminId, 'tax_region_update', 'TaxRegion', id, existing, region);
    return region;
  }

  async deleteTaxRegion(adminId: string, id: string) {
    if (!this.hasTaxModels) throw new BadRequestException('Tax models not available. Run: npx prisma generate (in apps/api)');
    const region = await this.taxPrisma.taxRegion.findUnique({
      where: { id },
      include: { _count: { select: { taxRates: true } } },
    });
    if (!region) throw new NotFoundException('Vergi bölgesi bulunamadı');
    if (region._count.taxRates > 0) {
      throw new BadRequestException('Bu bölgede vergi oranları tanımlı. Önce oranları silin.');
    }
    await this.taxPrisma.taxRule.deleteMany({ where: { taxRegionId: id } });
    await this.taxPrisma.taxRegion.delete({ where: { id } });
    await this.createAuditLog(adminId, 'tax_region_delete', 'TaxRegion', id, region, null);
    return { success: true };
  }

  async getTaxRates(regionId?: string) {
    if (!this.hasTaxModels) return { data: [] };
    const where = regionId ? { taxRegionId: regionId } : {};
    const rates = await this.taxPrisma.taxRate.findMany({
      where,
      include: {
        taxRegion: { select: { id: true, name: true, countryCode: true } },
      },
      orderBy: [{ taxRegionId: 'asc' }, { sortOrder: 'asc' }, { rate: 'asc' }],
    });
    return {
      data: rates.map((r: any) => ({
        id: r.id,
        taxRegionId: r.taxRegionId,
        taxRegionName: r.taxRegion.name,
        countryCode: r.taxRegion.countryCode,
        name: r.name,
        rate: Number(r.rate),
        isDefault: r.isDefault,
        effectiveFrom: r.effectiveFrom,
        effectiveTo: r.effectiveTo,
        sortOrder: r.sortOrder,
        isActive: r.isActive,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
      })),
    };
  }

  async createTaxRate(adminId: string, dto: {
    taxRegionId: string;
    name: string;
    rate: number;
    isDefault?: boolean;
    effectiveFrom?: string;
    effectiveTo?: string;
    sortOrder?: number;
    isActive?: boolean;
  }) {
    if (!this.hasTaxModels) throw new BadRequestException('Tax models not available. Run: npx prisma generate (in apps/api)');
    const region = await this.taxPrisma.taxRegion.findUnique({ where: { id: dto.taxRegionId } });
    if (!region) throw new NotFoundException('Vergi bölgesi bulunamadı');
    if (dto.isDefault) {
      await this.taxPrisma.taxRate.updateMany({
        where: { taxRegionId: dto.taxRegionId },
        data: { isDefault: false },
      });
    }
    const rate = await this.taxPrisma.taxRate.create({
      data: {
        taxRegionId: dto.taxRegionId,
        name: dto.name,
        rate: dto.rate,
        isDefault: dto.isDefault ?? false,
        effectiveFrom: dto.effectiveFrom ? new Date(dto.effectiveFrom) : null,
        effectiveTo: dto.effectiveTo ? new Date(dto.effectiveTo) : null,
        sortOrder: dto.sortOrder ?? 0,
        isActive: dto.isActive ?? true,
      },
    });
    await this.createAuditLog(adminId, 'tax_rate_create', 'TaxRate', rate.id, null, rate);
    return rate;
  }

  async updateTaxRate(adminId: string, id: string, dto: {
    name?: string;
    rate?: number;
    isDefault?: boolean;
    effectiveFrom?: string;
    effectiveTo?: string;
    sortOrder?: number;
    isActive?: boolean;
  }) {
    if (!this.hasTaxModels) throw new BadRequestException('Tax models not available. Run: npx prisma generate (in apps/api)');
    const existing = await this.taxPrisma.taxRate.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Vergi oranı bulunamadı');
    if (dto.isDefault != null && dto.isDefault) {
      await this.taxPrisma.taxRate.updateMany({
        where: { taxRegionId: existing.taxRegionId },
        data: { isDefault: false },
      });
    }
    const rate = await this.taxPrisma.taxRate.update({
      where: { id },
      data: {
        ...(dto.name != null && { name: dto.name }),
        ...(dto.rate != null && { rate: dto.rate }),
        ...(dto.isDefault != null && { isDefault: dto.isDefault }),
        ...(dto.effectiveFrom !== undefined && { effectiveFrom: dto.effectiveFrom ? new Date(dto.effectiveFrom) : null }),
        ...(dto.effectiveTo !== undefined && { effectiveTo: dto.effectiveTo ? new Date(dto.effectiveTo) : null }),
        ...(dto.sortOrder != null && { sortOrder: dto.sortOrder }),
        ...(dto.isActive != null && { isActive: dto.isActive }),
      },
    });
    await this.createAuditLog(adminId, 'tax_rate_update', 'TaxRate', id, existing, rate);
    return rate;
  }

  async deleteTaxRate(adminId: string, id: string) {
    if (!this.hasTaxModels) throw new BadRequestException('Tax models not available. Run: npx prisma generate (in apps/api)');
    const rate = await this.taxPrisma.taxRate.findUnique({
      where: { id },
      include: { _count: { select: { taxRules: true } } },
    });
    if (!rate) throw new NotFoundException('Vergi oranı bulunamadı');
    if (rate._count.taxRules > 0) {
      throw new BadRequestException('Bu orana bağlı vergi kuralları var. Önce kuralları silin veya güncelleyin.');
    }
    await this.taxPrisma.taxRate.delete({ where: { id } });
    await this.createAuditLog(adminId, 'tax_rate_delete', 'TaxRate', id, rate, null);
    return { success: true };
  }

  async getTaxRules(regionId?: string) {
    if (!this.hasTaxModels) return { data: [] };
    const where = regionId ? { taxRegionId: regionId } : {};
    const rules = await this.taxPrisma.taxRule.findMany({
      where,
      include: {
        taxRegion: { select: { id: true, name: true, countryCode: true } },
        taxRate: { select: { id: true, name: true, rate: true } },
        category: { select: { id: true, name: true } },
      },
      orderBy: [{ taxRegionId: 'asc' }, { priority: 'desc' }, { createdAt: 'asc' }],
    });
    return {
      data: rules.map((r: any) => ({
        id: r.id,
        taxRegionId: r.taxRegionId,
        taxRegionName: r.taxRegion.name,
        taxRateId: r.taxRateId,
        taxRateName: r.taxRate.name,
        taxRateValue: Number(r.taxRate.rate),
        scope: r.scope,
        categoryId: r.categoryId,
        categoryName: r.category?.name ?? null,
        priority: r.priority,
        isActive: r.isActive,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
      })),
    };
  }

  async createTaxRule(adminId: string, dto: {
    taxRegionId: string;
    taxRateId: string;
    scope: string;
    categoryId?: string;
    priority?: number;
    isActive?: boolean;
  }) {
    if (!this.hasTaxModels) throw new BadRequestException('Tax models not available. Run: npx prisma generate (in apps/api)');
    const region = await this.taxPrisma.taxRegion.findUnique({ where: { id: dto.taxRegionId } });
    if (!region) throw new NotFoundException('Vergi bölgesi bulunamadı');
    const rate = await this.taxPrisma.taxRate.findUnique({ where: { id: dto.taxRateId } });
    if (!rate) throw new NotFoundException('Vergi oranı bulunamadı');
    if (rate.taxRegionId !== dto.taxRegionId) {
      throw new BadRequestException('Vergi oranı bu bölgeye ait değil.');
    }
    if (dto.scope === 'category' && !dto.categoryId) {
      throw new BadRequestException('Kategori kuralı için categoryId gerekli.');
    }
    const rule = await this.taxPrisma.taxRule.create({
      data: {
        taxRegionId: dto.taxRegionId,
        taxRateId: dto.taxRateId,
        scope: dto.scope as 'default_rate' | 'category' | 'product',
        categoryId: dto.categoryId ?? null,
        priority: dto.priority ?? 0,
        isActive: dto.isActive ?? true,
      },
    });
    await this.createAuditLog(adminId, 'tax_rule_create', 'TaxRule', rule.id, null, rule);
    return rule;
  }

  async updateTaxRule(adminId: string, id: string, dto: {
    taxRateId?: string;
    scope?: string;
    categoryId?: string;
    priority?: number;
    isActive?: boolean;
  }) {
    if (!this.hasTaxModels) throw new BadRequestException('Tax models not available. Run: npx prisma generate (in apps/api)');
    const existing = await this.taxPrisma.taxRule.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Vergi kuralı bulunamadı');
    const rate = await this.taxPrisma.taxRule.update({
      where: { id },
      data: {
        ...(dto.taxRateId != null && { taxRateId: dto.taxRateId }),
        ...(dto.scope != null && { scope: dto.scope as 'default_rate' | 'category' | 'product' }),
        ...(dto.categoryId !== undefined && { categoryId: dto.categoryId || null }),
        ...(dto.priority != null && { priority: dto.priority }),
        ...(dto.isActive != null && { isActive: dto.isActive }),
      },
    });
    await this.createAuditLog(adminId, 'tax_rule_update', 'TaxRule', id, existing, rate);
    return rate;
  }

  async deleteTaxRule(adminId: string, id: string) {
    if (!this.hasTaxModels) throw new BadRequestException('Tax models not available. Run: npx prisma generate (in apps/api)');
    const rule = await this.taxPrisma.taxRule.findUnique({ where: { id } });
    if (!rule) throw new NotFoundException('Vergi kuralı bulunamadı');
    await this.taxPrisma.taxRule.delete({ where: { id } });
    await this.createAuditLog(adminId, 'tax_rule_delete', 'TaxRule', id, rule, null);
    return { success: true };
  }

  /**
   * Tax reporting: aggregate tax from invoices by period and optionally by region.
   */
  async getTaxReport(query: {
    fromDate?: string;
    toDate?: string;
    groupBy?: 'day' | 'month' | 'year' | 'region';
    regionId?: string;
  }) {
    const from = query.fromDate ? new Date(query.fromDate) : new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
    const to = query.toDate ? new Date(query.toDate) : new Date();
    if (from > to) throw new BadRequestException('fromDate must be before toDate');

    const invoices = await this.prisma.invoice.findMany({
      where: {
        issuedAt: { gte: from, lte: to },
        status: { not: 'cancelled' },
      },
      select: {
        id: true,
        taxAmount: true,
        total: true,
        subtotal: true,
        issuedAt: true,
        orderId: true,
      },
      orderBy: { issuedAt: 'asc' },
    });

    const totalTaxCollected = invoices.reduce((sum, inv) => sum + Number(inv.taxAmount), 0);
    const totalRevenue = invoices.reduce((sum, inv) => sum + Number(inv.total), 0);
    const invoiceCount = invoices.length;

    const summary = {
      fromDate: from.toISOString().slice(0, 10),
      toDate: to.toISOString().slice(0, 10),
      totalTaxCollected: Math.round(totalTaxCollected * 100) / 100,
      totalRevenue: Math.round(totalRevenue * 100) / 100,
      invoiceCount,
    };

    let breakdown: Array<{ period: string; taxCollected: number; revenue: number; count: number }> = [];
    const groupBy = query.groupBy || 'month';

    if (groupBy === 'day') {
      const byDay = new Map<string, { tax: number; revenue: number; count: number }>();
      for (const inv of invoices) {
        const key = inv.issuedAt.toISOString().slice(0, 10);
        const cur = byDay.get(key) || { tax: 0, revenue: 0, count: 0 };
        cur.tax += Number(inv.taxAmount);
        cur.revenue += Number(inv.total);
        cur.count += 1;
        byDay.set(key, cur);
      }
      breakdown = Array.from(byDay.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([period, v]) => ({
          period,
          taxCollected: Math.round(v.tax * 100) / 100,
          revenue: Math.round(v.revenue * 100) / 100,
          count: v.count,
        }));
    } else if (groupBy === 'month') {
      const byMonth = new Map<string, { tax: number; revenue: number; count: number }>();
      for (const inv of invoices) {
        const key = inv.issuedAt.toISOString().slice(0, 7);
        const cur = byMonth.get(key) || { tax: 0, revenue: 0, count: 0 };
        cur.tax += Number(inv.taxAmount);
        cur.revenue += Number(inv.total);
        cur.count += 1;
        byMonth.set(key, cur);
      }
      breakdown = Array.from(byMonth.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([period, v]) => ({
          period,
          taxCollected: Math.round(v.tax * 100) / 100,
          revenue: Math.round(v.revenue * 100) / 100,
          count: v.count,
        }));
    } else if (groupBy === 'year') {
      const byYear = new Map<string, { tax: number; revenue: number; count: number }>();
      for (const inv of invoices) {
        const key = inv.issuedAt.getFullYear().toString();
        const cur = byYear.get(key) || { tax: 0, revenue: 0, count: 0 };
        cur.tax += Number(inv.taxAmount);
        cur.revenue += Number(inv.total);
        cur.count += 1;
        byYear.set(key, cur);
      }
      breakdown = Array.from(byYear.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([period, v]) => ({
          period,
          taxCollected: Math.round(v.tax * 100) / 100,
          revenue: Math.round(v.revenue * 100) / 100,
          count: v.count,
        }));
    }

    return {
      summary,
      breakdown,
      data: invoices.map((inv) => ({
        id: inv.id,
        orderId: inv.orderId,
        taxAmount: Number(inv.taxAmount),
        total: Number(inv.total),
        issuedAt: inv.issuedAt,
      })),
    };
  }

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
      orderBy: { sortOrder: 'asc' },
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
  async updateMembershipTier(adminId: string, tierId: string, dto: {
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
    featuredListingSlots?: number;
    commissionDiscount?: number;
    isActive?: boolean;
    sortOrder?: number;
  }) {
    const tier = await this.prisma.membershipTier.findUnique({
      where: { id: tierId },
    });

    if (!tier) {
      throw new NotFoundException('Üyelik seviyesi bulunamadı');
    }

    const oldTier = { ...tier };

    const updatedTier = await this.prisma.membershipTier.update({
      where: { id: tierId },
      data: {
        name: dto.name,
        description: dto.description,
        monthlyPrice: dto.monthlyPrice !== undefined ? dto.monthlyPrice : undefined,
        yearlyPrice: dto.yearlyPrice !== undefined ? dto.yearlyPrice : undefined,
        maxFreeListings: dto.maxFreeListings,
        maxTotalListings: dto.maxTotalListings,
        maxImagesPerListing: dto.maxImagesPerListing,
        canCreateCollections: dto.canCreateCollections,
        canTrade: dto.canTrade,
        isAdFree: dto.isAdFree,
        featuredListingSlots: dto.featuredListingSlots,
        commissionDiscount: dto.commissionDiscount !== undefined ? dto.commissionDiscount : undefined,
        isActive: dto.isActive,
        sortOrder: dto.sortOrder,
      },
    });

    // Create audit log
    await this.createAuditLog(adminId, 'membership_tier_update', 'MembershipTier', tierId, oldTier, updatedTier);

    return updatedTier;
  }

  // ==================== PRODUCT DELETION (ADMIN) ====================

  /**
   * Delete product (admin only)
   * - Cannot delete sold products
   * - Cannot delete reserved products
   * - Cannot delete products with active orders
   * - Soft delete (inactive) or hard delete based on conditions
   */
  async deleteProduct(adminId: string, productId: string, hardDelete: boolean = false) {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      include: {
        orders: {
          where: {
            status: {
              in: [OrderStatus.pending_payment, OrderStatus.paid, OrderStatus.preparing, OrderStatus.shipped],
            },
          },
        },
        _count: {
          select: { offers: true, orders: true },
        },
      },
    });

    if (!product) {
      throw new NotFoundException('Ürün bulunamadı');
    }

    // Check if product is sold
    if (product.status === ProductStatus.sold) {
      throw new BadRequestException('Satılmış ürünler silinemez');
    }

    // Check if product is reserved
    if (product.status === ProductStatus.reserved) {
      throw new BadRequestException('Rezerve edilmiş ürünler silinemez');
    }

    // Check if product has active orders
    if (product.orders.length > 0) {
      throw new BadRequestException('Aktif siparişi olan ürünler silinemez');
    }

    const oldProduct = { ...product };

    if (hardDelete && product._count.offers === 0 && product._count.orders === 0) {
      // Hard delete - only if no offers and no orders
      await this.prisma.product.delete({
        where: { id: productId },
      });

      // Create audit log
      await this.createAuditLog(adminId, 'product_delete_hard', 'Product', productId, oldProduct, null);

      return { success: true, productId, deleted: true };
    } else {
      // Soft delete - set to deleted (pasif/inactive'den AYRI state: yönetici
      // kaldırması. Satıcı bunu yeniden aktive edemez; kendi pasifiyle karışmaz.)
      await this.prisma.product.update({
        where: { id: productId },
        data: { status: ProductStatus.deleted },
      });

      // Create audit log
      await this.createAuditLog(adminId, 'product_delete_soft', 'Product', productId, oldProduct, {
        ...oldProduct,
        status: ProductStatus.deleted,
      });

      return { success: true, productId, deleted: false, status: 'deleted' };
    }
  }

  // ==================== BRAND MANAGEMENT ====================

  /**
   * Get all brands
   */
  async getBrands() {
    const brands = await this.prisma.brand.findMany({
      orderBy: { name: 'asc' },
    });

    return {
      data: brands.map((b: Brand) => ({
        id: b.id,
        name: b.name,
        slug: b.slug,
        logo: b.logo,
        description: b.description,
        website: b.website,
        sortOrder: b.sortOrder,
        isActive: b.isActive,
        createdAt: b.createdAt,
        updatedAt: b.updatedAt,
      })),
    };
  }

  /**
   * Create a new brand
   */
  async createBrand(
    adminId: string,
    dto: {
      name: string;
      logo?: string;
      description?: string;
      website?: string;
      sortOrder?: number;
      isActive?: boolean;
    },
  ) {
    // Generate slug from name
    const slug = dto.name
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .trim();

    // Check if brand with same name or slug exists
    const existing = await this.prisma.brand.findFirst({
      where: {
        OR: [
          { name: { equals: dto.name, mode: 'insensitive' } },
          { slug },
        ],
      },
    });

    if (existing) {
      throw new BadRequestException('Bu isimde bir marka zaten mevcut');
    }

    const brand = await this.prisma.brand.create({
      data: {
        name: dto.name,
        slug,
        logo: dto.logo,
        description: dto.description,
        website: dto.website,
        sortOrder: dto.sortOrder ?? 0,
        isActive: dto.isActive ?? true,
      },
    });

    // Create audit log
    await this.createAuditLog(adminId, 'brand_create', 'Brand', brand.id, null, brand);

    this.logger.log(`Brand created: ${brand.name} (${brand.id}) by admin ${adminId}`);

    return brand;
  }

  /**
   * Update brand
   */
  async updateBrand(
    adminId: string,
    brandId: string,
    dto: {
      name?: string;
      logo?: string;
      description?: string;
      website?: string;
      sortOrder?: number;
      isActive?: boolean;
    },
  ) {
    const existing = await this.prisma.brand.findUnique({
      where: { id: brandId },
    });

    if (!existing) {
      throw new NotFoundException('Marka bulunamadı');
    }

    // If name is being changed, check for duplicates and update slug
    let slug = existing.slug;
    if (dto.name && dto.name !== existing.name) {
      slug = dto.name
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .trim();

      const duplicate = await this.prisma.brand.findFirst({
        where: {
          OR: [
            { name: { equals: dto.name, mode: 'insensitive' } },
            { slug },
          ],
          NOT: { id: brandId },
        },
      });

      if (duplicate) {
        throw new BadRequestException('Bu isimde bir marka zaten mevcut');
      }
    }

    const updated = await this.prisma.brand.update({
      where: { id: brandId },
      data: {
        name: dto.name,
        slug: dto.name ? slug : undefined,
        logo: dto.logo,
        description: dto.description,
        website: dto.website,
        sortOrder: dto.sortOrder,
        isActive: dto.isActive,
      },
    });

    // Create audit log
    await this.createAuditLog(adminId, 'brand_update', 'Brand', brandId, existing, updated);

    this.logger.log(`Brand updated: ${updated.name} (${updated.id}) by admin ${adminId}`);

    return updated;
  }

  /**
   * Delete brand
   */
  async deleteBrand(adminId: string, brandId: string) {
    const existing = await this.prisma.brand.findUnique({
      where: { id: brandId },
    });

    if (!existing) {
      throw new NotFoundException('Marka bulunamadı');
    }

    await this.prisma.brand.delete({
      where: { id: brandId },
    });

    // Create audit log
    await this.createAuditLog(adminId, 'brand_delete', 'Brand', brandId, existing, null);

    this.logger.log(`Brand deleted: ${existing.name} (${existing.id}) by admin ${adminId}`);

    return { success: true };
  }

  // ==================== MANUFACTURER MANAGEMENT ====================

  async getManufacturers() {
    const manufacturers = await this.prisma.manufacturer.findMany({
      orderBy: { name: 'asc' },
    });
    return {
      data: manufacturers.map(m => ({
        ...m,
        logo: this.resolveProductImageUrl(m.logo),
      })),
    };
  }

  async createManufacturer(
    adminId: string,
    dto: { name: string; logo?: string; description?: string; website?: string; country?: string; sortOrder?: number; isActive?: boolean },
  ) {
    const slug = dto.name
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .trim();

    const existing = await this.prisma.manufacturer.findFirst({
      where: { OR: [{ name: { equals: dto.name, mode: 'insensitive' } }, { slug }] },
    });
    if (existing) throw new BadRequestException('Bu isimde bir üretici zaten mevcut');

    const manufacturer = await this.prisma.manufacturer.create({
      data: {
        name: dto.name,
        slug,
        logo: dto.logo,
        description: dto.description,
        website: dto.website,
        country: dto.country,
        sortOrder: dto.sortOrder ?? 0,
        isActive: dto.isActive ?? true,
      },
    });
    await this.createAuditLog(adminId, 'manufacturer_create', 'Manufacturer', manufacturer.id, null, manufacturer);
    return manufacturer;
  }

  async updateManufacturer(
    adminId: string,
    id: string,
    dto: { name?: string; logo?: string; description?: string; website?: string; country?: string; sortOrder?: number; isActive?: boolean },
  ) {
    const existing = await this.prisma.manufacturer.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Üretici bulunamadı');

    let slug = existing.slug;
    if (dto.name && dto.name !== existing.name) {
      slug = dto.name.toLowerCase().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-').trim();
      const duplicate = await this.prisma.manufacturer.findFirst({
        where: { OR: [{ name: { equals: dto.name, mode: 'insensitive' } }, { slug }], NOT: { id } },
      });
      if (duplicate) throw new BadRequestException('Bu isimde bir üretici zaten mevcut');
    }

    const updated = await this.prisma.manufacturer.update({
      where: { id },
      data: {
        name: dto.name,
        slug: dto.name ? slug : undefined,
        logo: dto.logo,
        description: dto.description,
        website: dto.website,
        country: dto.country,
        sortOrder: dto.sortOrder,
        isActive: dto.isActive,
      },
    });
    await this.createAuditLog(adminId, 'manufacturer_update', 'Manufacturer', id, existing, updated);
    return updated;
  }

  async deleteManufacturer(adminId: string, id: string) {
    const existing = await this.prisma.manufacturer.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Üretici bulunamadı');
    await this.prisma.manufacturer.delete({ where: { id } });
    await this.createAuditLog(adminId, 'manufacturer_delete', 'Manufacturer', id, existing, null);
    return { success: true };
  }

  // ==================== CAR MODEL MANAGEMENT ====================

  async getCarModels(brandId?: string) {
    const where = brandId ? { brandId } : {};
    const models = await this.prisma.carModel.findMany({
      where,
      orderBy: [{ brand: { name: 'asc' } }, { name: 'asc' }],
      include: { brand: { select: { id: true, name: true, slug: true } } },
    });
    return { data: models };
  }

  async createCarModel(
    adminId: string,
    dto: { brandId: string; name: string; slug?: string; yearStart?: number; yearEnd?: number; sortOrder?: number; isActive?: boolean },
  ) {
    const brand = await this.prisma.brand.findUnique({ where: { id: dto.brandId } });
    if (!brand) throw new NotFoundException('Marka bulunamadı');

    const slug =
      dto.slug ||
      `${brand.slug}-${dto.name}`
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .trim();

    const existing = await this.prisma.carModel.findFirst({
      where: { OR: [{ slug }, { brandId: dto.brandId, name: { equals: dto.name, mode: 'insensitive' } }] },
    });
    if (existing) throw new BadRequestException('Bu isimde veya slug ile bir model zaten mevcut');

    const model = await this.prisma.carModel.create({
      data: {
        brandId: dto.brandId,
        name: dto.name,
        slug,
        yearStart: dto.yearStart,
        yearEnd: dto.yearEnd,
        sortOrder: dto.sortOrder ?? 0,
        isActive: dto.isActive ?? true,
      },
    });
    await this.createAuditLog(adminId, 'car_model_create', 'CarModel', model.id, null, model);
    await this.cache.delPattern('car-models:*');
    return model;
  }

  async updateCarModel(
    adminId: string,
    id: string,
    dto: { name?: string; slug?: string; yearStart?: number; yearEnd?: number; sortOrder?: number; isActive?: boolean },
  ) {
    const existing = await this.prisma.carModel.findUnique({ where: { id }, include: { brand: true } });
    if (!existing) throw new NotFoundException('Model bulunamadı');

    let slug = existing.slug;
    if (dto.slug) slug = dto.slug;
    else if (dto.name && dto.name !== existing.name) {
      slug = `${existing.brand.slug}-${dto.name}`
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .trim();
    }

    if (slug !== existing.slug) {
      const duplicate = await this.prisma.carModel.findFirst({ where: { slug, NOT: { id } } });
      if (duplicate) throw new BadRequestException('Bu slug ile bir model zaten mevcut');
    }

    const updated = await this.prisma.carModel.update({
      where: { id },
      data: {
        name: dto.name,
        slug: dto.slug || (dto.name ? slug : undefined),
        yearStart: dto.yearStart,
        yearEnd: dto.yearEnd,
        sortOrder: dto.sortOrder,
        isActive: dto.isActive,
      },
    });
    await this.createAuditLog(adminId, 'car_model_update', 'CarModel', id, existing, updated);
    await this.cache.delPattern('car-models:*');
    return updated;
  }

  async deleteCarModel(adminId: string, id: string) {
    const existing = await this.prisma.carModel.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Model bulunamadı');
    await this.prisma.carModel.delete({ where: { id } });
    await this.createAuditLog(adminId, 'car_model_delete', 'CarModel', id, existing, null);
    await this.cache.delPattern('car-models:*');
    return { success: true };
  }

  // ==================== SHIPPING METHODS ====================

  /**
   * Get all shipping methods
   */
  async getShippingMethods(query?: { isActive?: boolean; search?: string }) {
    const where: Prisma.ShippingMethodWhereInput = {};

    if (query?.isActive !== undefined) {
      where.isActive = query.isActive;
    }

    if (query?.search) {
      const ids = await fulltextShippingMethodSearch(this.prisma, query.search);
      if (ids.length === 0) return [];
      where.id = { in: ids };
    }

    const methods = await this.prisma.shippingMethod.findMany({
      where,
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });

    return methods;
  }

  /**
   * Create shipping method
   */
  async createShippingMethod(adminId: string, dto: {
    name: string;
    code: string;
    description?: string;
    isActive?: boolean;
    sortOrder?: number;
  }) {
    // Check if code exists
    const existing = await this.prisma.shippingMethod.findUnique({
      where: { code: dto.code },
    });

    if (existing) {
      throw new BadRequestException('Bu kod zaten kullanılıyor');
    }

    const method = await this.prisma.shippingMethod.create({
      data: {
        name: dto.name,
        code: dto.code.toLowerCase(),
        description: dto.description,
        isActive: dto.isActive ?? true,
        sortOrder: dto.sortOrder ?? 0,
      },
    });

    await this.createAuditLog(adminId, 'shipping_method_create', 'ShippingMethod', method.id, null, method);

    this.logger.log(`Shipping method created: ${method.name} by admin ${adminId}`);

    return method;
  }

  /**
   * Update shipping method
   */
  async updateShippingMethod(adminId: string, methodId: string, dto: {
    name?: string;
    code?: string;
    description?: string;
    isActive?: boolean;
    sortOrder?: number;
  }) {
    const existing = await this.prisma.shippingMethod.findUnique({
      where: { id: methodId },
    });

    if (!existing) {
      throw new NotFoundException('Kargo yöntemi bulunamadı');
    }

    // Check if new code conflicts
    if (dto.code && dto.code !== existing.code) {
      const conflict = await this.prisma.shippingMethod.findUnique({
        where: { code: dto.code },
      });
      if (conflict) {
        throw new BadRequestException('Bu kod zaten kullanılıyor');
      }
    }

    const updated = await this.prisma.shippingMethod.update({
      where: { id: methodId },
      data: {
        name: dto.name,
        code: dto.code?.toLowerCase(),
        description: dto.description,
        isActive: dto.isActive,
        sortOrder: dto.sortOrder,
      },
    });

    await this.createAuditLog(adminId, 'shipping_method_update', 'ShippingMethod', methodId, existing, updated);

    return updated;
  }

  /**
   * Delete shipping method
   */
  async deleteShippingMethod(adminId: string, methodId: string) {
    const existing = await this.prisma.shippingMethod.findUnique({
      where: { id: methodId },
      include: { _count: { select: { rates: true } } },
    });

    if (!existing) {
      throw new NotFoundException('Kargo yöntemi bulunamadı');
    }

    if (existing._count.rates > 0) {
      throw new BadRequestException('Bu yönteme bağlı fiyatlandırmalar var. Önce onları silin.');
    }

    await this.prisma.shippingMethod.delete({
      where: { id: methodId },
    });

    await this.createAuditLog(adminId, 'shipping_method_delete', 'ShippingMethod', methodId, existing, null);

    return { success: true };
  }

  // ==================== SHIPPING CARRIERS ====================

  /**
   * Get all shipping carriers
   */
  async getShippingCarriers(query?: { isActive?: boolean; supportsLabels?: boolean; search?: string }) {
    const where: Prisma.ShippingCarrierWhereInput = {};

    if (query?.isActive !== undefined) {
      where.isActive = query.isActive;
    }

    if (query?.supportsLabels !== undefined) {
      where.supportsLabels = query.supportsLabels;
    }

    if (query?.search) {
      const ids = await fulltextShippingCarrierSearch(this.prisma, query.search);
      if (ids.length === 0) return [];
      where.id = { in: ids };
    }

    const carriers = await this.prisma.shippingCarrier.findMany({
      where,
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        code: true,
        logo: true,
        trackingUrl: true,
        isActive: true,
        supportsLabels: true,
        createdAt: true,
        updatedAt: true,
        // Don't expose API credentials
      },
    });

    return carriers;
  }

  /**
   * Create shipping carrier
   */
  async createShippingCarrier(adminId: string, dto: {
    name: string;
    code: string;
    logo?: string;
    trackingUrl?: string;
    apiEndpoint?: string;
    apiKey?: string;
    apiSecret?: string;
    isActive?: boolean;
    supportsLabels?: boolean;
  }) {
    const existing = await this.prisma.shippingCarrier.findUnique({
      where: { code: dto.code },
    });

    if (existing) {
      throw new BadRequestException('Bu kargo firması kodu zaten kullanılıyor');
    }

    const carrier = await this.prisma.shippingCarrier.create({
      data: {
        name: dto.name,
        code: dto.code.toLowerCase(),
        logo: dto.logo,
        trackingUrl: dto.trackingUrl,
        apiEndpoint: dto.apiEndpoint,
        apiKey: dto.apiKey,
        apiSecret: dto.apiSecret,
        isActive: dto.isActive ?? true,
        supportsLabels: dto.supportsLabels ?? true,
      },
    });

    // Don't include secrets in audit log
    const safeCarrier = { ...carrier, apiKey: '***', apiSecret: '***' };
    await this.createAuditLog(adminId, 'shipping_carrier_create', 'ShippingCarrier', carrier.id, null, safeCarrier);

    this.logger.log(`Shipping carrier created: ${carrier.name} by admin ${adminId}`);

    return {
      id: carrier.id,
      name: carrier.name,
      code: carrier.code,
      logo: carrier.logo,
      trackingUrl: carrier.trackingUrl,
      isActive: carrier.isActive,
      supportsLabels: carrier.supportsLabels,
      createdAt: carrier.createdAt,
      updatedAt: carrier.updatedAt,
    };
  }

  /**
   * Update shipping carrier
   */
  async updateShippingCarrier(adminId: string, carrierId: string, dto: {
    name?: string;
    code?: string;
    logo?: string;
    trackingUrl?: string;
    apiEndpoint?: string;
    apiKey?: string;
    apiSecret?: string;
    isActive?: boolean;
    supportsLabels?: boolean;
  }) {
    const existing = await this.prisma.shippingCarrier.findUnique({
      where: { id: carrierId },
    });

    if (!existing) {
      throw new NotFoundException('Kargo firması bulunamadı');
    }

    if (dto.code && dto.code !== existing.code) {
      const conflict = await this.prisma.shippingCarrier.findUnique({
        where: { code: dto.code },
      });
      if (conflict) {
        throw new BadRequestException('Bu kargo firması kodu zaten kullanılıyor');
      }
    }

    const updated = await this.prisma.shippingCarrier.update({
      where: { id: carrierId },
      data: {
        name: dto.name,
        code: dto.code?.toLowerCase(),
        logo: dto.logo,
        trackingUrl: dto.trackingUrl,
        apiEndpoint: dto.apiEndpoint,
        apiKey: dto.apiKey,
        apiSecret: dto.apiSecret,
        isActive: dto.isActive,
        supportsLabels: dto.supportsLabels,
      },
    });

    await this.createAuditLog(adminId, 'shipping_carrier_update', 'ShippingCarrier', carrierId,
      { ...existing, apiKey: '***', apiSecret: '***' },
      { ...updated, apiKey: '***', apiSecret: '***' });

    return {
      id: updated.id,
      name: updated.name,
      code: updated.code,
      logo: updated.logo,
      trackingUrl: updated.trackingUrl,
      isActive: updated.isActive,
      supportsLabels: updated.supportsLabels,
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
    };
  }

  /**
   * Delete shipping carrier
   */
  async deleteShippingCarrier(adminId: string, carrierId: string) {
    const existing = await this.prisma.shippingCarrier.findUnique({
      where: { id: carrierId },
      include: { _count: { select: { rates: true } } },
    });

    if (!existing) {
      throw new NotFoundException('Kargo firması bulunamadı');
    }

    if (existing._count.rates > 0) {
      throw new BadRequestException('Bu kargo firmasına bağlı fiyatlandırmalar var. Önce onları silin.');
    }

    await this.prisma.shippingCarrier.delete({
      where: { id: carrierId },
    });

    await this.createAuditLog(adminId, 'shipping_carrier_delete', 'ShippingCarrier', carrierId, existing, null);

    return { success: true };
  }

  // ==================== SHIPPING ZONES ====================

  /**
   * Get all shipping zones
   */
  async getShippingZones(query?: { isActive?: boolean; country?: string; search?: string }) {
    const where: Prisma.ShippingZoneWhereInput = {};

    if (query?.isActive !== undefined) {
      where.isActive = query.isActive;
    }

    if (query?.country) {
      where.countries = { has: query.country.toUpperCase() };
    }

    if (query?.search) {
      const ids = await fulltextShippingZoneSearch(this.prisma, query.search);
      if (ids.length === 0) return [];
      where.id = { in: ids };
    }

    const zones = await this.prisma.shippingZone.findMany({
      where,
      orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
      include: {
        _count: { select: { rates: true } },
      },
    });

    return zones.map(z => ({
      ...z,
      ratesCount: z._count.rates,
    }));
  }

  /**
   * Create shipping zone
   */
  async createShippingZone(adminId: string, dto: {
    name: string;
    description?: string;
    countries?: string[];
    regions?: string[];
    cities?: string[];
    isDefault?: boolean;
    isActive?: boolean;
  }) {
    // If setting as default, remove default from others
    if (dto.isDefault) {
      await this.prisma.shippingZone.updateMany({
        where: { isDefault: true },
        data: { isDefault: false },
      });
    }

    const zone = await this.prisma.shippingZone.create({
      data: {
        name: dto.name,
        description: dto.description,
        countries: dto.countries?.map(c => c.toUpperCase()) || [],
        regions: dto.regions || [],
        cities: dto.cities || [],
        isDefault: dto.isDefault ?? false,
        isActive: dto.isActive ?? true,
      },
    });

    await this.createAuditLog(adminId, 'shipping_zone_create', 'ShippingZone', zone.id, null, zone);

    this.logger.log(`Shipping zone created: ${zone.name} by admin ${adminId}`);

    return zone;
  }

  /**
   * Update shipping zone
   */
  async updateShippingZone(adminId: string, zoneId: string, dto: {
    name?: string;
    description?: string;
    countries?: string[];
    regions?: string[];
    cities?: string[];
    isDefault?: boolean;
    isActive?: boolean;
  }) {
    const existing = await this.prisma.shippingZone.findUnique({
      where: { id: zoneId },
    });

    if (!existing) {
      throw new NotFoundException('Kargo bölgesi bulunamadı');
    }

    // If setting as default, remove default from others
    if (dto.isDefault && !existing.isDefault) {
      await this.prisma.shippingZone.updateMany({
        where: { isDefault: true, id: { not: zoneId } },
        data: { isDefault: false },
      });
    }

    const updated = await this.prisma.shippingZone.update({
      where: { id: zoneId },
      data: {
        name: dto.name,
        description: dto.description,
        countries: dto.countries?.map(c => c.toUpperCase()),
        regions: dto.regions,
        cities: dto.cities,
        isDefault: dto.isDefault,
        isActive: dto.isActive,
      },
    });

    await this.createAuditLog(adminId, 'shipping_zone_update', 'ShippingZone', zoneId, existing, updated);

    return updated;
  }

  /**
   * Delete shipping zone
   */
  async deleteShippingZone(adminId: string, zoneId: string) {
    const existing = await this.prisma.shippingZone.findUnique({
      where: { id: zoneId },
      include: { _count: { select: { rates: true } } },
    });

    if (!existing) {
      throw new NotFoundException('Kargo bölgesi bulunamadı');
    }

    if (existing._count.rates > 0) {
      throw new BadRequestException('Bu bölgeye bağlı fiyatlandırmalar var. Önce onları silin.');
    }

    await this.prisma.shippingZone.delete({
      where: { id: zoneId },
    });

    await this.createAuditLog(adminId, 'shipping_zone_delete', 'ShippingZone', zoneId, existing, null);

    return { success: true };
  }

  // ==================== SHIPPING RATES ====================

  /**
   * Get shipping rates
   */
  async getShippingRates(query?: { zoneId?: string; methodId?: string; carrierId?: string; isActive?: boolean }) {
    const where: Prisma.ShippingRateWhereInput = {};

    if (query?.zoneId) where.zoneId = query.zoneId;
    if (query?.methodId) where.methodId = query.methodId;
    if (query?.carrierId) where.carrierId = query.carrierId;
    if (query?.isActive !== undefined) where.isActive = query.isActive;

    const rates = await this.prisma.shippingRate.findMany({
      where,
      include: {
        zone: { select: { id: true, name: true } },
        method: { select: { id: true, name: true, code: true } },
        carrier: { select: { id: true, name: true, code: true } },
      },
      orderBy: [{ zone: { name: 'asc' } }, { method: { name: 'asc' } }],
    });

    return rates.map(r => ({
      ...r,
      basePrice: Number(r.basePrice),
      pricePerKg: Number(r.pricePerKg),
      freeShippingMin: r.freeShippingMin ? Number(r.freeShippingMin) : null,
    }));
  }

  /**
   * Create shipping rate
   */
  async createShippingRate(adminId: string, dto: {
    zoneId: string;
    methodId: string;
    carrierId: string;
    basePrice: number;
    pricePerKg?: number;
    freeShippingMin?: number;
    minDeliveryDays: number;
    maxDeliveryDays: number;
    isActive?: boolean;
  }) {
    // Validate references exist
    const [zone, method, carrier] = await Promise.all([
      this.prisma.shippingZone.findUnique({ where: { id: dto.zoneId } }),
      this.prisma.shippingMethod.findUnique({ where: { id: dto.methodId } }),
      this.prisma.shippingCarrier.findUnique({ where: { id: dto.carrierId } }),
    ]);

    if (!zone) throw new NotFoundException('Kargo bölgesi bulunamadı');
    if (!method) throw new NotFoundException('Kargo yöntemi bulunamadı');
    if (!carrier) throw new NotFoundException('Kargo firması bulunamadı');

    // Check for duplicate combination
    const existing = await this.prisma.shippingRate.findUnique({
      where: {
        zoneId_methodId_carrierId: {
          zoneId: dto.zoneId,
          methodId: dto.methodId,
          carrierId: dto.carrierId,
        },
      },
    });

    if (existing) {
      throw new BadRequestException('Bu kombinasyon için zaten bir fiyatlandırma mevcut');
    }

    const rate = await this.prisma.shippingRate.create({
      data: {
        zoneId: dto.zoneId,
        methodId: dto.methodId,
        carrierId: dto.carrierId,
        basePrice: dto.basePrice,
        pricePerKg: dto.pricePerKg ?? 0,
        freeShippingMin: dto.freeShippingMin,
        minDeliveryDays: dto.minDeliveryDays,
        maxDeliveryDays: dto.maxDeliveryDays,
        isActive: dto.isActive ?? true,
      },
      include: {
        zone: { select: { id: true, name: true } },
        method: { select: { id: true, name: true, code: true } },
        carrier: { select: { id: true, name: true, code: true } },
      },
    });

    await this.createAuditLog(adminId, 'shipping_rate_create', 'ShippingRate', rate.id, null, rate);

    return {
      ...rate,
      basePrice: Number(rate.basePrice),
      pricePerKg: Number(rate.pricePerKg),
      freeShippingMin: rate.freeShippingMin ? Number(rate.freeShippingMin) : null,
    };
  }

  /**
   * Update shipping rate
   */
  async updateShippingRate(adminId: string, rateId: string, dto: {
    zoneId?: string;
    methodId?: string;
    carrierId?: string;
    basePrice?: number;
    pricePerKg?: number;
    freeShippingMin?: number;
    minDeliveryDays?: number;
    maxDeliveryDays?: number;
    isActive?: boolean;
  }) {
    const existing = await this.prisma.shippingRate.findUnique({
      where: { id: rateId },
    });

    if (!existing) {
      throw new NotFoundException('Kargo fiyatlandırması bulunamadı');
    }

    const updated = await this.prisma.shippingRate.update({
      where: { id: rateId },
      data: {
        zoneId: dto.zoneId,
        methodId: dto.methodId,
        carrierId: dto.carrierId,
        basePrice: dto.basePrice,
        pricePerKg: dto.pricePerKg,
        freeShippingMin: dto.freeShippingMin,
        minDeliveryDays: dto.minDeliveryDays,
        maxDeliveryDays: dto.maxDeliveryDays,
        isActive: dto.isActive,
      },
      include: {
        zone: { select: { id: true, name: true } },
        method: { select: { id: true, name: true, code: true } },
        carrier: { select: { id: true, name: true, code: true } },
      },
    });

    await this.createAuditLog(adminId, 'shipping_rate_update', 'ShippingRate', rateId, existing, updated);

    return {
      ...updated,
      basePrice: Number(updated.basePrice),
      pricePerKg: Number(updated.pricePerKg),
      freeShippingMin: updated.freeShippingMin ? Number(updated.freeShippingMin) : null,
    };
  }

  /**
   * Delete shipping rate
   */
  async deleteShippingRate(adminId: string, rateId: string) {
    const existing = await this.prisma.shippingRate.findUnique({
      where: { id: rateId },
    });

    if (!existing) {
      throw new NotFoundException('Kargo fiyatlandırması bulunamadı');
    }

    await this.prisma.shippingRate.delete({
      where: { id: rateId },
    });

    await this.createAuditLog(adminId, 'shipping_rate_delete', 'ShippingRate', rateId, existing, null);

    return { success: true };
  }

  // ==================== SHIPPING LABELS ====================

  /**
   * Get list of shipments
   */
  async getShipments(query: {
    page?: number;
    limit?: number;
    status?: string;
    carrierId?: string;
  }) {
    const { page = 1, limit = 10, status, carrierId } = query;
    const where: Prisma.ShipmentWhereInput = {};

    if (status) where.status = status as any;
    if (carrierId) where.provider = carrierId;

    const [total, shipments] = await Promise.all([
      this.prisma.shipment.count({ where }),
      this.prisma.shipment.findMany({
        where,
        include: {
          order: {
            include: {
              buyer: { select: { id: true, displayName: true, email: true } },
              seller: { select: { id: true, displayName: true, email: true } },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return {
      data: shipments,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Generate shipping label for a shipment
   */
  async generateShippingLabel(adminId: string, shipmentId: string) {
    const shipment = await this.prisma.shipment.findUnique({
      where: { id: shipmentId },
      include: {
        order: {
          include: {
            buyer: { select: { displayName: true, email: true, phone: true } },
          },
        },
      },
    });

    if (!shipment) {
      throw new NotFoundException('Gönderi bulunamadı');
    }

    // Get carrier info
    const carrier = await this.prisma.shippingCarrier.findUnique({
      where: { code: shipment.provider },
    });

    // Mock label generation - in production, this would call carrier API
    const labelUrl = `https://labels.example.com/${shipmentId}.pdf`;
    const trackingNumber = shipment.trackingNumber || `TRK${Date.now()}${Math.random().toString(36).substr(2, 6).toUpperCase()}`;

    // Update shipment with label info
    const updated = await this.prisma.shipment.update({
      where: { id: shipmentId },
      data: {
        labelUrl,
        trackingNumber,
        trackingUrl: carrier?.trackingUrl?.replace('{{tracking}}', trackingNumber),
      },
    });

    await this.createAuditLog(adminId, 'shipping_label_generate', 'Shipment', shipmentId, shipment, updated);

    this.logger.log(`Shipping label generated for shipment ${shipmentId} by admin ${adminId}`);

    return {
      shipmentId,
      labelUrl,
      trackingNumber,
      carrier: shipment.provider,
      generatedAt: new Date(),
    };
  }

  /**
   * Bulk generate shipping labels
   */
  async bulkGenerateShippingLabels(adminId: string, shipmentIds: string[]) {
    const results = await Promise.allSettled(
      shipmentIds.map(id => this.generateShippingLabel(adminId, id))
    );

    const successful = results.filter((r): r is PromiseFulfilledResult<any> => r.status === 'fulfilled')
      .map(r => r.value);
    const failed = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected')
      .map((r, i) => ({ shipmentId: shipmentIds[i], error: r.reason?.message || 'Unknown error' }));

    return {
      successful,
      failed,
      totalRequested: shipmentIds.length,
      successCount: successful.length,
      failCount: failed.length,
    };
  }

  // ==================== NOTIFICATION MANAGEMENT ====================

  /**
   * Get notification history
   */
  async getNotificationHistory(query: {
    page?: number;
    limit?: number;
    channel?: string;
    status?: string;
    userId?: string;
    type?: string;
    startDate?: string;
    endDate?: string;
  }) {
    const { page = 1, limit = 20 } = query;
    const where: Prisma.NotificationLogWhereInput = {};

    if (query.channel) where.channel = query.channel;
    if (query.status) where.status = query.status;
    if (query.userId) where.userId = query.userId;
    if (query.type) where.type = query.type;
    if (query.startDate || query.endDate) {
      where.createdAt = {};
      if (query.startDate) where.createdAt.gte = new Date(query.startDate);
      if (query.endDate) where.createdAt.lte = new Date(query.endDate);
    }

    const [total, logs] = await Promise.all([
      this.prisma.notificationLog.count({ where }),
      this.prisma.notificationLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    // Get user info for logs
    const userIds = [...new Set(logs.map(l => l.userId))];
    const users = await this.prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, displayName: true, email: true },
    });
    const userMap = new Map(users.map(u => [u.id, u]));

    return {
      data: logs.map(l => ({
        ...l,
        user: userMap.get(l.userId) || null,
      })),
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  /**
   * Send notification to users
   */
  async sendNotification(adminId: string, dto: {
    title: string;
    body: string;
    channels: string[];
    targetType: 'all' | 'segment' | 'user_ids';
    userIds?: string[];
    segmentCriteria?: Record<string, any>;
    data?: Record<string, any>;
  }) {
    let targetUserIds: string[] = [];

    try {
      if (dto.targetType === 'user_ids') {
        targetUserIds = dto.userIds || [];
      } else if (dto.targetType === 'all') {
        const users = await this.prisma.user.findMany({
          where: { isBanned: false },
          select: { id: true },
        });
        targetUserIds = users.map(u => u.id);
      } else if (dto.targetType === 'segment' && dto.segmentCriteria) {
        const where: Prisma.UserWhereInput = { isBanned: false };
        if (dto.segmentCriteria.isSeller !== undefined) {
          where.isSeller = dto.segmentCriteria.isSeller;
        }
        if (dto.segmentCriteria.membershipTier) {
          where.membership = { tier: { type: dto.segmentCriteria.membershipTier as any } };
        }
        const users = await this.prisma.user.findMany({
          where,
          select: { id: true },
        });
        targetUserIds = users.map(u => u.id);
      }

      if (targetUserIds.length === 0) {
        throw new BadRequestException('Hedef kullanıcı bulunamadı');
      }

      // Create notification logs - always include in_app for user visibility
      const notificationLogs: Array<{
        userId: string;
        channel: string;
        type: string;
        title: string;
        body: string;
        data: any;
        status: string;
        sentAt?: Date;
      }> = [];

      for (const userId of targetUserIds) {
        // Always create an in_app entry so users see it in their notification center
        notificationLogs.push({
          userId,
          channel: 'in_app',
          type: 'admin_broadcast',
          title: dto.title,
          body: dto.body,
          data: dto.data || ({} as any),
          status: 'sent',
          sentAt: new Date(),
        });

        // Create entries for other selected channels (for tracking/audit)
        for (const channel of dto.channels) {
          if (channel !== 'in_app') {
            notificationLogs.push({
              userId,
              channel,
              type: 'admin_broadcast',
              title: dto.title,
              body: dto.body,
              data: dto.data || ({} as any),
              status: 'pending',
            });
          }
        }
      }

      // Chunk the createMany operation to avoid parameter limit issues in PostgreSQL
      const chunkSize = 5000;
      for (let i = 0; i < notificationLogs.length; i += chunkSize) {
        const chunk = notificationLogs.slice(i, i + chunkSize);
        await this.prisma.notificationLog.createMany({
          data: chunk,
        });
      }

      // Trigger broadcast events (handles queues for Email/Push and creates In-App logs)
      // Note: emitAdminBroadcast handles its own In-App log creation to ensure consistency, 
      // but we created logs above for consistency with the audit log and historical tracking.
      await this.eventService.emitAdminBroadcast({
        userIds: targetUserIds,
        title: dto.title,
        body: dto.body,
        channels: dto.channels,
        data: dto.data
      });

      // Update the logs we created to 'sent' status since we just emitted them
      await this.prisma.notificationLog.updateMany({
        where: {
          userId: { in: targetUserIds },
          channel: { in: dto.channels },
          title: dto.title,
          body: dto.body,
          status: 'pending'
        },
        data: {
          status: 'sent',
          sentAt: new Date()
        }
      });

      // Log the action
      await this.createAuditLog(
        adminId,
        'notification_send',
        'NotificationLog',
        'bulk',
        null,
        {
          targetCount: targetUserIds.length,
          channels: dto.channels,
          title: dto.title,
          targetType: dto.targetType
        }
      );

      this.logger.log(`Admin ${adminId} sent notification to ${targetUserIds.length} users via ${dto.channels.join(', ')}`);

      return {
        success: true,
        targetCount: targetUserIds.length,
        channels: dto.channels,
        message: `Bildirim ${targetUserIds.length} kullanıcıya gönderildi`,
      };
    } catch (error) {
      this.logger.error(`Failed to send notification: ${error.message}`, error.stack);
      if (error instanceof BadRequestException) throw error;
      throw new BadRequestException(`Bildirim gönderilemedi: ${error.message}`);
    }
  }

  /**
   * Schedule a notification
   */
  async scheduleNotification(adminId: string, dto: {
    title: string;
    body: string;
    channels: string[];
    targetType: 'all' | 'segment' | 'user_ids';
    userIds?: string[];
    segmentCriteria?: Record<string, any>;
    scheduledFor: string;
  }) {
    const scheduledDate = new Date(dto.scheduledFor);
    if (scheduledDate <= new Date()) {
      throw new BadRequestException('Zamanlama tarihi gelecekte olmalıdır');
    }

    const scheduled = await this.prisma.scheduledNotification.create({
      data: {
        title: dto.title,
        body: dto.body,
        channels: dto.channels,
        targetType: dto.targetType,
        targetData: dto.targetType === 'user_ids'
          ? (dto.userIds as any)
          : (dto.segmentCriteria as any) || Prisma.JsonNull,
        scheduledFor: scheduledDate,
        createdBy: adminId,
        status: 'pending',
      },
    });

    await this.createAuditLog(adminId, 'notification_schedule', 'ScheduledNotification', scheduled.id, null, scheduled);

    this.logger.log(`Notification scheduled for ${dto.scheduledFor} by admin ${adminId}`);

    return scheduled;
  }

  /**
   * Get scheduled notifications
   */
  async getScheduledNotifications(query?: { page?: number; limit?: number; status?: string }) {
    const { page = 1, limit = 20 } = query || {};
    const where: Prisma.ScheduledNotificationWhereInput = {};

    if (query?.status) {
      where.status = query.status;
    }

    const [total, notifications] = await Promise.all([
      this.prisma.scheduledNotification.count({ where }),
      this.prisma.scheduledNotification.findMany({
        where,
        orderBy: { scheduledFor: 'asc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return {
      data: notifications,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  /**
   * Cancel scheduled notification
   */
  async cancelScheduledNotification(adminId: string, notificationId: string) {
    const existing = await this.prisma.scheduledNotification.findUnique({
      where: { id: notificationId },
    });

    if (!existing) {
      throw new NotFoundException('Zamanlanmış bildirim bulunamadı');
    }

    if (existing.status !== 'pending') {
      throw new BadRequestException('Sadece bekleyen bildirimler iptal edilebilir');
    }

    const updated = await this.prisma.scheduledNotification.update({
      where: { id: notificationId },
      data: { status: 'cancelled' },
    });

    await this.createAuditLog(adminId, 'notification_cancel', 'ScheduledNotification', notificationId, existing, updated);

    return { success: true };
  }

  // ==================== ERROR LOGS ====================

  /**
   * Get error logs with filtering and pagination
   */
  async getErrorLogs(query: {
    page?: number;
    limit?: number;
    severity?: string;
    source?: string;
    userId?: string;
    startDate?: string;
    endDate?: string;
    search?: string;
  }) {
    const { page = 1, limit = 20, severity, source, userId, startDate, endDate, search } = query;
    const where: Prisma.ErrorLogWhereInput = {};

    if (severity) where.severity = severity;
    if (source) where.source = source;
    if (userId) where.userId = userId;

    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate);
      if (endDate) where.createdAt.lte = new Date(endDate);
    }

    if (search) {
      const ids = await fulltextErrorLogSearch(this.prisma, search);
      if (ids.length === 0) {
        return { data: [], total: 0, page, limit, totalPages: 0, stats: [] };
      }
      where.id = { in: ids };
    }

    const [total, logs] = await Promise.all([
      this.prisma.errorLog.count({ where }),
      this.prisma.errorLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    // Get severity stats
    const stats = await this.prisma.errorLog.groupBy({
      by: ['severity'],
      _count: { id: true },
      where: startDate || endDate ? {
        createdAt: where.createdAt,
      } : undefined,
    });

    return {
      data: logs,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
      stats: {
        critical: stats.find(s => s.severity === 'critical')?._count?.id || 0,
        error: stats.find(s => s.severity === 'error')?._count?.id || 0,
        warning: stats.find(s => s.severity === 'warning')?._count?.id || 0,
      },
    };
  }

  // ==================== SECURITY LOGS ====================

  /**
   * Get security logs with filtering and pagination
   */
  async getSecurityLogs(query: {
    page?: number;
    limit?: number;
    eventType?: string;
    severity?: string;
    ipAddress?: string;
    userId?: string;
    resolved?: boolean;
    startDate?: string;
    endDate?: string;
    search?: string;
  }) {
    const { page = 1, limit = 20, eventType, severity, ipAddress, userId, resolved, startDate, endDate, search } = query;
    const where: Prisma.SecurityLogWhereInput = {};

    if (eventType) where.eventType = eventType;
    if (severity) where.severity = severity;
    if (ipAddress) where.ipAddress = ipAddress;
    if (userId) where.userId = userId;
    if (resolved !== undefined) where.resolved = resolved;

    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate);
      if (endDate) where.createdAt.lte = new Date(endDate);
    }

    if (search) {
      const ids = await fulltextSecurityLogSearch(this.prisma, search);
      if (ids.length === 0) {
        return { data: [], total: 0, page, limit, totalPages: 0 };
      }
      where.id = { in: ids };
    }

    const [total, logs] = await Promise.all([
      this.prisma.securityLog.count({ where }),
      this.prisma.securityLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    // Get event type stats
    const stats = await this.prisma.securityLog.groupBy({
      by: ['eventType'],
      _count: { id: true },
      where: { resolved: false },
    });

    // Count unresolved high severity
    const unresolvedHighSeverity = await this.prisma.securityLog.count({
      where: { resolved: false, severity: { in: ['high', 'critical'] } },
    });

    return {
      data: logs,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
      stats: {
        byEventType: stats.reduce((acc, s) => {
          acc[s.eventType] = s._count.id;
          return acc;
        }, {} as Record<string, number>),
        unresolvedHighSeverity,
      },
    };
  }

  /**
   * Resolve a security issue
   */
  async resolveSecurityIssue(adminId: string, logId: string, notes?: string) {
    const existing = await this.prisma.securityLog.findUnique({
      where: { id: logId },
    });

    if (!existing) {
      throw new NotFoundException('Güvenlik kaydı bulunamadı');
    }

    if (existing.resolved) {
      throw new BadRequestException('Bu sorun zaten çözümlendi');
    }

    const updated = await this.prisma.securityLog.update({
      where: { id: logId },
      data: {
        resolved: true,
        resolvedBy: adminId,
        resolvedAt: new Date(),
        details: {
          ...(existing.details as Record<string, any> || {}),
          resolutionNotes: notes,
        },
      },
    });

    await this.createAuditLog(adminId, 'security_issue_resolve', 'SecurityLog', logId, existing, updated);

    this.logger.log(`Security issue ${logId} resolved by admin ${adminId}`);

    return updated;
  }

  /**
   * Block an IP address
   */
  async blockIP(adminId: string, ipAddress: string, reason?: string) {
    // Log the block action
    const blockLog = await this.prisma.securityLog.create({
      data: {
        eventType: 'ip_block',
        severity: 'high',
        ipAddress,
        details: { reason, blockedBy: adminId },
      },
    });

    await this.createAuditLog(adminId, 'ip_block', 'SecurityLog', blockLog.id, null, blockLog);

    this.logger.log(`IP ${ipAddress} blocked by admin ${adminId}. Reason: ${reason}`);

    return { success: true, ipAddress, blockedAt: blockLog.createdAt };
  }

  // ==================== EMAIL LOGS ====================

  /**
   * Get email logs with filtering and pagination
   */
  async getEmailLogs(query: {
    page?: number;
    limit?: number;
    status?: string;
    template?: string;
    to?: string;
    userId?: string;
    startDate?: string;
    endDate?: string;
    search?: string;
  }) {
    const { page = 1, limit = 20, status, template, to, userId, startDate, endDate, search } = query;
    const where: Prisma.EmailLogWhereInput = {};

    if (status) where.status = status;
    if (template) where.template = template;
    if (userId) where.userId = userId;

    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate);
      if (endDate) where.createdAt.lte = new Date(endDate);
    }

    const searchTerm = search || to;
    if (searchTerm) {
      const ids = await fulltextEmailLogSearch(this.prisma, searchTerm);
      if (ids.length === 0) {
        return { data: [], total: 0, page, limit, totalPages: 0 };
      }
      where.id = { in: ids };
    }

    const [total, logs] = await Promise.all([
      this.prisma.emailLog.count({ where }),
      this.prisma.emailLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    // Get status stats
    const stats = await this.prisma.emailLog.groupBy({
      by: ['status'],
      _count: { id: true },
      where: startDate || endDate ? {
        createdAt: where.createdAt,
      } : undefined,
    });

    // Get template stats
    const templateStats = await this.prisma.emailLog.groupBy({
      by: ['template'],
      _count: { id: true },
      where: {
        template: { not: null },
        createdAt: startDate || endDate ? where.createdAt : undefined,
      },
      take: 10,
      orderBy: { _count: { id: 'desc' } },
    });

    return {
      data: logs,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
      stats: {
        byStatus: stats.reduce((acc, s) => {
          acc[s.status] = s._count.id;
          return acc;
        }, {} as Record<string, number>),
        byTemplate: templateStats.reduce((acc, s) => {
          if (s.template) acc[s.template] = s._count.id;
          return acc;
        }, {} as Record<string, number>),
        deliveryRate: (() => {
          const sent = stats.find(s => s.status === 'sent')?._count?.id || 0;
          const delivered = stats.find(s => s.status === 'delivered')?._count?.id || 0;
          const total = sent + delivered;
          return total > 0 ? Math.round((delivered / total) * 100) : 0;
        })(),
        bounceRate: (() => {
          const total = stats.reduce((sum, s) => sum + s._count.id, 0);
          const bounced = stats.find(s => s.status === 'bounced')?._count?.id || 0;
          return total > 0 ? Math.round((bounced / total) * 100) : 0;
        })(),
      },
    };
  }

  // ==================== COLLECTION MANAGEMENT ====================

  /**
   * Get collections with filtering and pagination (admin view)
   */
  async getCollections(query: {
    search?: string;
    userId?: string;
    isPublic?: boolean;
    isFeatured?: boolean;
    page?: number;
    limit?: number;
    sortBy?: 'createdAt' | 'name' | 'likeCount' | 'viewCount';
    sortOrder?: 'asc' | 'desc';
  }) {
    const { page = 1, limit = 20, search, userId, isPublic, isFeatured, sortBy = 'createdAt', sortOrder = 'desc' } = query;

    const esSortMap: Record<string, 'popular' | 'recent' | 'name'> = {
      createdAt: 'recent', viewCount: 'popular', likeCount: 'popular', name: 'name',
    };

    if (search && this.searchService.isAvailable()) {
      const esResult = await this.searchService.searchCollections({
        query: search,
        isPublic,
        isFeatured,
        userId,
        sortBy: esSortMap[sortBy] ?? 'recent',
        page,
        pageSize: limit,
      });

      if (esResult && esResult.ids.length > 0) {
        const collections = await this.prisma.collection.findMany({
          where: { id: { in: esResult.ids } },
          include: {
            user: { select: { id: true, displayName: true, avatarUrl: true } },
            _count: { select: { items: true } },
          },
        });
        const orderMap = new Map(esResult.ids.map((id, i) => [id, i]));
        collections.sort((a, b) => (orderMap.get(a.id) ?? 0) - (orderMap.get(b.id) ?? 0));
        return {
          data: collections.map(c => ({
            id: c.id, name: c.name, slug: c.slug, description: c.description,
            coverImageUrl: c.coverImageKey ? this.storageService.getPublicAssetUrl(c.coverImageKey) : undefined, isPublic: c.isPublic, isFeatured: c.isFeatured,
            viewCount: c.viewCount, likeCount: c.likeCount, itemCount: c._count.items,
            owner: c.user, createdAt: c.createdAt, updatedAt: c.updatedAt,
          })),
          total: esResult.total, page, limit, totalPages: Math.ceil(esResult.total / limit),
        };
      }
      if (esResult && esResult.total === 0) {
        return { data: [], total: 0, page, limit, totalPages: 0 };
      }
    }

    const where: Prisma.CollectionWhereInput = {};
    if (search) {
      const ids = await fulltextCollectionSearch(this.prisma, search);
      if (ids.length === 0) {
        return { data: [], total: 0, page, limit, totalPages: 0 };
      }
      where.id = { in: ids };
    }
    if (userId) where.userId = userId;
    if (isPublic !== undefined) where.isPublic = isPublic;
    if (isFeatured !== undefined) where.isFeatured = isFeatured;

    const [total, collections] = await Promise.all([
      this.prisma.collection.count({ where }),
      this.prisma.collection.findMany({
        where,
        include: {
          user: { select: { id: true, displayName: true, avatarUrl: true } },
          _count: { select: { items: true } },
        },
        orderBy: { [sortBy]: sortOrder },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return {
      data: collections.map(c => ({
        id: c.id, name: c.name, slug: c.slug, description: c.description,
        coverImageUrl: c.coverImageKey ? this.storageService.getPublicAssetUrl(c.coverImageKey) : undefined, isPublic: c.isPublic, isFeatured: c.isFeatured,
        viewCount: c.viewCount, likeCount: c.likeCount, itemCount: c._count.items,
        owner: c.user, createdAt: c.createdAt, updatedAt: c.updatedAt,
      })),
      total, page, limit, totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Get collection by ID with items (admin view)
   */
  async getCollectionById(collectionId: string) {
    const collection = await this.prisma.collection.findUnique({
      where: { id: collectionId },
      include: {
        user: { select: { id: true, displayName: true, avatarUrl: true } },
        items: {
          include: {
            product: {
              select: {
                id: true,
                title: true,
                price: true,
                images: { take: 1, select: { cardKey: true } },
              },
            },
          },
          orderBy: { sortOrder: 'asc' },
        },
      },
    });

    if (!collection) {
      throw new NotFoundException('Koleksiyon bulunamadı');
    }

    return {
      id: collection.id,
      name: collection.name,
      slug: collection.slug,
      description: collection.description,
      coverImageUrl: collection.coverImageKey ? this.storageService.getPublicAssetUrl(collection.coverImageKey) : undefined,
      isPublic: collection.isPublic,
      isFeatured: collection.isFeatured,
      viewCount: collection.viewCount,
      likeCount: collection.likeCount,
      itemCount: collection.items.length,
      owner: collection.user,
      items: await Promise.all(collection.items.map(async item => ({
        id: item.id,
        productId: item.productId,
        sortOrder: item.sortOrder,
        product: item.product ? {
          id: item.product.id,
          title: item.product.title,
          price: Number(item.product.price),
          images: await Promise.all((item.product.images || []).map(async (img: any) => ({
            ...img,
            url: this.resolveProductImageUrl(img.cardKey),
          }))),
        } : null,
        customTitle: item.customTitle,
        customImageUrl: item.customImageUrl,
      }))),
      createdAt: collection.createdAt,
      updatedAt: collection.updatedAt,
    };
  }

  /**
   * Create collection (admin)
   */
  async createAdminCollection(adminId: string, dto: {
    name: string;
    description?: string;
    isPublic?: boolean;
    isFeatured?: boolean;
    coverImageKey?: string;
    userId?: string;
  }) {
    const slug = this.generateSlug(dto.name);
    const userId = dto.userId || adminId;

    // Check for unique slug within user's collections
    const existingSlug = await this.prisma.collection.findFirst({
      where: { userId, slug },
    });

    const finalSlug = existingSlug ? `${slug}-${Date.now()}` : slug;

    const collection = await this.prisma.collection.create({
      data: {
        userId,
        name: dto.name,
        slug: finalSlug,
        description: dto.description,
        isPublic: dto.isPublic ?? true,
        isFeatured: dto.isFeatured ?? false,
        coverImageKey: dto.coverImageKey,
      },
      include: {
        user: { select: { id: true, displayName: true, avatarUrl: true } },
      },
    });

    await this.createAuditLog(adminId, 'collection_create', 'Collection', collection.id, null, collection);

    return {
      ...collection,
      itemCount: 0,
      owner: collection.user,
    };
  }

  /**
   * Update collection (admin)
   */
  async updateAdminCollection(adminId: string, collectionId: string, dto: {
    name?: string;
    description?: string;
    isPublic?: boolean;
    isFeatured?: boolean;
    coverImageKey?: string;
  }) {
    const existing = await this.prisma.collection.findUnique({
      where: { id: collectionId },
    });

    if (!existing) {
      throw new NotFoundException('Koleksiyon bulunamadı');
    }

    const updateData: Prisma.CollectionUpdateInput = {};
    if (dto.name !== undefined) {
      updateData.name = dto.name;
      updateData.slug = this.generateSlug(dto.name);
    }
    if (dto.description !== undefined) updateData.description = dto.description;
    if (dto.isPublic !== undefined) updateData.isPublic = dto.isPublic;
    if (dto.isFeatured !== undefined) updateData.isFeatured = dto.isFeatured;
    if (dto.coverImageKey !== undefined) updateData.coverImageKey = dto.coverImageKey;

    const updated = await this.prisma.collection.update({
      where: { id: collectionId },
      data: updateData,
      include: {
        user: { select: { id: true, displayName: true, avatarUrl: true } },
        _count: { select: { items: true } },
      },
    });

    await this.createAuditLog(adminId, 'collection_update', 'Collection', collectionId, existing, updated);

    return {
      ...updated,
      itemCount: updated._count.items,
      owner: updated.user,
    };
  }

  /**
   * Delete collection (admin)
   */
  async deleteAdminCollection(adminId: string, collectionId: string) {
    const existing = await this.prisma.collection.findUnique({
      where: { id: collectionId },
    });

    if (!existing) {
      throw new NotFoundException('Koleksiyon bulunamadı');
    }

    await this.prisma.collection.delete({
      where: { id: collectionId },
    });

    await this.createAuditLog(adminId, 'collection_delete', 'Collection', collectionId, existing, null);

    return { success: true };
  }

  /**
   * Add products to collection
   */
  async addItemsToCollection(adminId: string, collectionId: string, productIds: string[]) {
    const collection = await this.prisma.collection.findUnique({
      where: { id: collectionId },
      include: { _count: { select: { items: true } } },
    });

    if (!collection) {
      throw new NotFoundException('Koleksiyon bulunamadı');
    }

    // Get max sort order
    const maxSortOrder = collection._count.items;

    // Create items
    const createdItems = await Promise.all(
      productIds.map((productId, index) =>
        this.prisma.collectionItem.create({
          data: {
            collectionId,
            productId,
            sortOrder: maxSortOrder + index,
          },
          include: {
            product: {
              select: {
                id: true,
                title: true,
                price: true,
                images: { take: 1, select: { cardKey: true } },
              },
            },
          },
        }).catch(() => null) // Ignore duplicates
      )
    );

    const successfulItems = createdItems.filter(item => item !== null);

    await this.createAuditLog(adminId, 'collection_items_add', 'Collection', collectionId, null, { addedProductIds: productIds });

    return {
      success: true,
      addedCount: successfulItems.length,
      items: successfulItems,
    };
  }

  /**
   * Remove item from collection
   */
  async removeItemFromAdminCollection(adminId: string, collectionId: string, itemId: string) {
    const item = await this.prisma.collectionItem.findFirst({
      where: { id: itemId, collectionId },
    });

    if (!item) {
      throw new NotFoundException('Koleksiyon öğesi bulunamadı');
    }

    await this.prisma.collectionItem.delete({
      where: { id: itemId },
    });

    await this.createAuditLog(adminId, 'collection_item_remove', 'CollectionItem', itemId, item, null);

    return { success: true };
  }

  /**
   * Set collection visibility
   */
  async setCollectionVisibility(adminId: string, collectionId: string, isPublic: boolean) {
    const existing = await this.prisma.collection.findUnique({
      where: { id: collectionId },
    });

    if (!existing) {
      throw new NotFoundException('Koleksiyon bulunamadı');
    }

    const updated = await this.prisma.collection.update({
      where: { id: collectionId },
      data: { isPublic },
    });

    await this.createAuditLog(adminId, 'collection_visibility_change', 'Collection', collectionId, { isPublic: existing.isPublic }, { isPublic });

    return { success: true, isPublic: updated.isPublic };
  }

  /**
   * Set collection featured status
   */
  async setCollectionFeatured(adminId: string, collectionId: string, isFeatured: boolean) {
    const existing = await this.prisma.collection.findUnique({
      where: { id: collectionId },
    });

    if (!existing) {
      throw new NotFoundException('Koleksiyon bulunamadı');
    }

    const updated = await this.prisma.collection.update({
      where: { id: collectionId },
      data: { isFeatured },
    });

    await this.createAuditLog(adminId, 'collection_featured_change', 'Collection', collectionId, { isFeatured: existing.isFeatured }, { isFeatured });

    return { success: true, isFeatured: updated.isFeatured };
  }

  // ==================== TAG MANAGEMENT ====================

  /**
   * Get tags with filtering and pagination
   */
  async getTags(query: {
    search?: string;
    isActive?: boolean;
    page?: number;
    limit?: number;
    sortBy?: 'name' | 'usageCount' | 'createdAt';
    sortOrder?: 'asc' | 'desc';
  }) {
    const { page = 1, limit = 20, search, isActive, sortBy = 'usageCount', sortOrder = 'desc' } = query;
    const where: Prisma.TagWhereInput = {};

    if (search) {
      const ids = await fulltextTagSearch(this.prisma, search);
      if (ids.length === 0) {
        return { data: [], total: 0, page, limit, totalPages: 0 };
      }
      where.id = { in: ids };
    }
    if (isActive !== undefined) where.isActive = isActive;

    const [total, tags] = await Promise.all([
      this.prisma.tag.count({ where }),
      this.prisma.tag.findMany({
        where,
        orderBy: { [sortBy]: sortOrder },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return {
      data: tags,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Create a new tag
   */
  async createTag(adminId: string, dto: {
    name: string;
    description?: string;
    color?: string;
    isActive?: boolean;
  }) {
    const slug = this.generateSlug(dto.name);

    // Check for existing tag
    const existing = await this.prisma.tag.findFirst({
      where: { OR: [{ name: dto.name }, { slug }] },
    });

    if (existing) {
      throw new BadRequestException('Bu isimde bir etiket zaten mevcut');
    }

    const tag = await this.prisma.tag.create({
      data: {
        name: dto.name,
        slug,
        description: dto.description,
        color: dto.color,
        isActive: dto.isActive ?? true,
      },
    });

    await this.createAuditLog(adminId, 'tag_create', 'Tag', tag.id, null, tag);

    return tag;
  }

  /**
   * Update a tag
   */
  async updateTag(adminId: string, tagId: string, dto: {
    name?: string;
    description?: string;
    color?: string;
    isActive?: boolean;
  }) {
    const existing = await this.prisma.tag.findUnique({
      where: { id: tagId },
    });

    if (!existing) {
      throw new NotFoundException('Etiket bulunamadı');
    }

    const updateData: Prisma.TagUpdateInput = {};
    if (dto.name !== undefined) {
      updateData.name = dto.name;
      updateData.slug = this.generateSlug(dto.name);
    }
    if (dto.description !== undefined) updateData.description = dto.description;
    if (dto.color !== undefined) updateData.color = dto.color;
    if (dto.isActive !== undefined) updateData.isActive = dto.isActive;

    const updated = await this.prisma.tag.update({
      where: { id: tagId },
      data: updateData,
    });

    await this.createAuditLog(adminId, 'tag_update', 'Tag', tagId, existing, updated);

    return updated;
  }

  /**
   * Delete a tag
   */
  async deleteTag(adminId: string, tagId: string) {
    const existing = await this.prisma.tag.findUnique({
      where: { id: tagId },
      include: { _count: { select: { products: true } } },
    });

    if (!existing) {
      throw new NotFoundException('Etiket bulunamadı');
    }

    if (existing._count.products > 0) {
      throw new BadRequestException(`Bu etiket ${existing._count.products} üründe kullanılıyor. Önce etiketleri kaldırın veya birleştirin.`);
    }

    await this.prisma.tag.delete({
      where: { id: tagId },
    });

    await this.createAuditLog(adminId, 'tag_delete', 'Tag', tagId, existing, null);

    return { success: true };
  }

  /**
   * Merge multiple tags into one
   */
  async mergeTags(adminId: string, sourceTagIds: string[], targetTagId: string) {
    // Validate target tag
    const targetTag = await this.prisma.tag.findUnique({
      where: { id: targetTagId },
    });

    if (!targetTag) {
      throw new NotFoundException('Hedef etiket bulunamadı');
    }

    if (sourceTagIds.includes(targetTagId)) {
      throw new BadRequestException('Hedef etiket kaynak etiketler arasında olamaz');
    }

    // Get source tags
    const sourceTags = await this.prisma.tag.findMany({
      where: { id: { in: sourceTagIds } },
    });

    if (sourceTags.length !== sourceTagIds.length) {
      throw new BadRequestException('Bazı kaynak etiketler bulunamadı');
    }

    // Merge in a transaction
    const result = await this.prisma.$transaction(async (tx) => {
      // Get all product-tag relations for source tags
      const sourceProductTags = await tx.productTag.findMany({
        where: { tagId: { in: sourceTagIds } },
      });

      // Update product tags to target tag (skip duplicates)
      let mergedCount = 0;
      for (const pt of sourceProductTags) {
        const exists = await tx.productTag.findUnique({
          where: { productId_tagId: { productId: pt.productId, tagId: targetTagId } },
        });

        if (!exists) {
          await tx.productTag.update({
            where: { id: pt.id },
            data: { tagId: targetTagId },
          });
          mergedCount++;
        } else {
          await tx.productTag.delete({ where: { id: pt.id } });
        }
      }

      // Delete source tags
      await tx.tag.deleteMany({
        where: { id: { in: sourceTagIds } },
      });

      // Update usage count on target tag
      const newUsageCount = await tx.productTag.count({
        where: { tagId: targetTagId },
      });

      await tx.tag.update({
        where: { id: targetTagId },
        data: { usageCount: newUsageCount },
      });

      return { mergedCount };
    });

    await this.createAuditLog(adminId, 'tags_merge', 'Tag', targetTagId, { sourceTagIds }, { targetTagId, mergedCount: result.mergedCount });

    const updatedTargetTag = await this.prisma.tag.findUnique({
      where: { id: targetTagId },
    });

    return {
      success: true,
      message: `${sourceTagIds.length} etiket birleştirildi`,
      mergedCount: result.mergedCount,
      targetTag: updatedTargetTag,
    };
  }

  /**
   * Bulk assign tags to products
   */
  async bulkAssignTags(adminId: string, productIds: string[], tagIds: string[]) {
    // Validate tags exist
    const tags = await this.prisma.tag.findMany({
      where: { id: { in: tagIds } },
    });

    if (tags.length !== tagIds.length) {
      throw new BadRequestException('Bazı etiketler bulunamadı');
    }

    // Create product-tag relations
    const createData: Prisma.ProductTagCreateManyInput[] = [];
    for (const productId of productIds) {
      for (const tagId of tagIds) {
        createData.push({ productId, tagId });
      }
    }

    const result = await this.prisma.productTag.createMany({
      data: createData,
      skipDuplicates: true,
    });

    // Update usage counts
    for (const tagId of tagIds) {
      const count = await this.prisma.productTag.count({
        where: { tagId },
      });
      await this.prisma.tag.update({
        where: { id: tagId },
        data: { usageCount: count },
      });
    }

    await this.createAuditLog(adminId, 'tags_bulk_assign', 'ProductTag', 'bulk', null, { productIds, tagIds, assignedCount: result.count });

    return {
      success: true,
      message: `${result.count} etiket ataması yapıldı`,
      assignedCount: result.count,
    };
  }

  /**
   * Bulk remove tags from products
   */
  async bulkRemoveTags(adminId: string, productIds: string[], tagIds: string[]) {
    const result = await this.prisma.productTag.deleteMany({
      where: {
        productId: { in: productIds },
        tagId: { in: tagIds },
      },
    });

    // Update usage counts
    for (const tagId of tagIds) {
      const count = await this.prisma.productTag.count({
        where: { tagId },
      });
      await this.prisma.tag.update({
        where: { id: tagId },
        data: { usageCount: count },
      });
    }

    await this.createAuditLog(adminId, 'tags_bulk_remove', 'ProductTag', 'bulk', null, { productIds, tagIds, removedCount: result.count });

    return {
      success: true,
      message: `${result.count} etiket kaldırıldı`,
      removedCount: result.count,
    };
  }

  // ==================== ATTRIBUTE GROUP MANAGEMENT ====================

  /**
   * Get attribute groups with their attributes
   */
  async getAttributeGroups(query: {
    search?: string;
    isActive?: boolean;
    page?: number;
    limit?: number;
  }) {
    const { page = 1, limit = 50, search, isActive } = query;
    const where: Prisma.AttributeGroupWhereInput = {};

    if (search) {
      const ids = await fulltextAttributeGroupSearch(this.prisma, search);
      if (ids.length === 0) {
        return { data: [], total: 0, page, limit, totalPages: 0 };
      }
      where.id = { in: ids };
    }
    if (isActive !== undefined) where.isActive = isActive;

    const [total, groups] = await Promise.all([
      this.prisma.attributeGroup.count({ where }),
      this.prisma.attributeGroup.findMany({
        where,
        include: {
          attributes: {
            orderBy: { sortOrder: 'asc' },
          },
          _count: { select: { attributes: true } },
        },
        orderBy: { sortOrder: 'asc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return {
      data: groups.map(g => ({
        ...g,
        attributeCount: g._count.attributes,
      })),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Get attribute group by ID
   */
  async getAttributeGroupById(groupId: string) {
    const group = await this.prisma.attributeGroup.findUnique({
      where: { id: groupId },
      include: {
        attributes: {
          orderBy: { sortOrder: 'asc' },
          include: {
            _count: { select: { productAttributes: true } },
          },
        },
      },
    });

    if (!group) {
      throw new NotFoundException('Özellik grubu bulunamadı');
    }

    return {
      ...group,
      attributeCount: group.attributes.length,
      attributes: group.attributes.map(a => ({
        ...a,
        usageCount: a._count.productAttributes,
      })),
    };
  }

  /**
   * Create attribute group
   */
  async createAttributeGroup(adminId: string, dto: {
    name: string;
    description?: string;
    isRequired?: boolean;
    isActive?: boolean;
    sortOrder?: number;
  }) {
    const slug = this.generateSlug(dto.name);

    const existing = await this.prisma.attributeGroup.findFirst({
      where: { OR: [{ name: dto.name }, { slug }] },
    });

    if (existing) {
      throw new BadRequestException('Bu isimde bir özellik grubu zaten mevcut');
    }

    const group = await this.prisma.attributeGroup.create({
      data: {
        name: dto.name,
        slug,
        description: dto.description,
        isRequired: dto.isRequired ?? false,
        isActive: dto.isActive ?? true,
        sortOrder: dto.sortOrder ?? 0,
      },
    });

    await this.createAuditLog(adminId, 'attribute_group_create', 'AttributeGroup', group.id, null, group);

    return { ...group, attributeCount: 0 };
  }

  /**
   * Update attribute group
   */
  async updateAttributeGroup(adminId: string, groupId: string, dto: {
    name?: string;
    description?: string;
    isRequired?: boolean;
    isActive?: boolean;
    sortOrder?: number;
  }) {
    const existing = await this.prisma.attributeGroup.findUnique({
      where: { id: groupId },
    });

    if (!existing) {
      throw new NotFoundException('Özellik grubu bulunamadı');
    }

    const updateData: Prisma.AttributeGroupUpdateInput = {};
    if (dto.name !== undefined) {
      updateData.name = dto.name;
      updateData.slug = this.generateSlug(dto.name);
    }
    if (dto.description !== undefined) updateData.description = dto.description;
    if (dto.isRequired !== undefined) updateData.isRequired = dto.isRequired;
    if (dto.isActive !== undefined) updateData.isActive = dto.isActive;
    if (dto.sortOrder !== undefined) updateData.sortOrder = dto.sortOrder;

    const updated = await this.prisma.attributeGroup.update({
      where: { id: groupId },
      data: updateData,
      include: { _count: { select: { attributes: true } } },
    });

    await this.createAuditLog(adminId, 'attribute_group_update', 'AttributeGroup', groupId, existing, updated);

    return { ...updated, attributeCount: updated._count.attributes };
  }

  /**
   * Delete attribute group
   */
  async deleteAttributeGroup(adminId: string, groupId: string) {
    const existing = await this.prisma.attributeGroup.findUnique({
      where: { id: groupId },
      include: { _count: { select: { attributes: true } } },
    });

    if (!existing) {
      throw new NotFoundException('Özellik grubu bulunamadı');
    }

    if (existing._count.attributes > 0) {
      throw new BadRequestException(`Bu grupta ${existing._count.attributes} özellik değeri var. Önce değerleri silin.`);
    }

    await this.prisma.attributeGroup.delete({
      where: { id: groupId },
    });

    await this.createAuditLog(adminId, 'attribute_group_delete', 'AttributeGroup', groupId, existing, null);

    return { success: true };
  }

  // ==================== ATTRIBUTE VALUE MANAGEMENT ====================

  /**
   * Get attributes with filtering
   */
  async getAttributes(query: {
    groupId?: string;
    search?: string;
    isActive?: boolean;
    page?: number;
    limit?: number;
  }) {
    const { page = 1, limit = 50, groupId, search, isActive } = query;
    const where: Prisma.AttributeWhereInput = {};

    if (groupId) where.groupId = groupId;
    if (search) {
      const ids = await fulltextAttributeSearch(this.prisma, search);
      if (ids.length === 0) {
        return { data: [], total: 0, page, limit, totalPages: 0 };
      }
      where.id = { in: ids };
    }
    if (isActive !== undefined) where.isActive = isActive;

    const [total, attributes] = await Promise.all([
      this.prisma.attribute.count({ where }),
      this.prisma.attribute.findMany({
        where,
        include: {
          group: { select: { id: true, name: true } },
          _count: { select: { productAttributes: true } },
        },
        orderBy: [{ groupId: 'asc' }, { sortOrder: 'asc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return {
      data: attributes.map(a => ({
        ...a,
        usageCount: a._count.productAttributes,
      })),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Create attribute value
   */
  async createAttribute(adminId: string, dto: {
    groupId: string;
    value: string;
    displayValue?: string;
    color?: string;
    sortOrder?: number;
    isActive?: boolean;
  }) {
    // Verify group exists
    const group = await this.prisma.attributeGroup.findUnique({
      where: { id: dto.groupId },
    });

    if (!group) {
      throw new NotFoundException('Özellik grubu bulunamadı');
    }

    // Scale group: use same slug normalization as product.service linkProductAttributes
    const slug =
      group.slug === 'scale'
        ? dto.value.replace(/\s/g, '').replace(/[:\/]/g, '').toLowerCase() || this.generateSlug(dto.value)
        : this.generateSlug(dto.value);

    // Check for duplicate
    const existing = await this.prisma.attribute.findFirst({
      where: { groupId: dto.groupId, slug },
    });

    if (existing) {
      throw new BadRequestException('Bu değer bu grupta zaten mevcut');
    }

    const attribute = await this.prisma.attribute.create({
      data: {
        groupId: dto.groupId,
        value: dto.value,
        slug,
        displayValue: dto.displayValue,
        color: dto.color,
        sortOrder: dto.sortOrder ?? 0,
        isActive: dto.isActive ?? true,
      },
      include: {
        group: { select: { id: true, name: true } },
      },
    });

    await this.createAuditLog(adminId, 'attribute_create', 'Attribute', attribute.id, null, attribute);

    return { ...attribute, usageCount: 0 };
  }

  /**
   * Update attribute value
   */
  async updateAttribute(adminId: string, attributeId: string, dto: {
    value?: string;
    displayValue?: string;
    color?: string;
    sortOrder?: number;
    isActive?: boolean;
  }) {
    const existing = await this.prisma.attribute.findUnique({
      where: { id: attributeId },
    });

    if (!existing) {
      throw new NotFoundException('Özellik değeri bulunamadı');
    }

    const updateData: Prisma.AttributeUpdateInput = {};
    if (dto.value !== undefined) {
      updateData.value = dto.value;
      const group = await this.prisma.attributeGroup.findUnique({ where: { id: existing.groupId } });
      updateData.slug =
        group?.slug === 'scale'
          ? dto.value.replace(/\s/g, '').replace(/[:\/]/g, '').toLowerCase() || this.generateSlug(dto.value)
          : this.generateSlug(dto.value);
    }
    if (dto.displayValue !== undefined) updateData.displayValue = dto.displayValue;
    if (dto.color !== undefined) updateData.color = dto.color;
    if (dto.sortOrder !== undefined) updateData.sortOrder = dto.sortOrder;
    if (dto.isActive !== undefined) updateData.isActive = dto.isActive;

    const updated = await this.prisma.attribute.update({
      where: { id: attributeId },
      data: updateData,
      include: {
        group: { select: { id: true, name: true } },
        _count: { select: { productAttributes: true } },
      },
    });

    await this.createAuditLog(adminId, 'attribute_update', 'Attribute', attributeId, existing, updated);

    return { ...updated, usageCount: updated._count.productAttributes };
  }

  /**
   * Delete attribute value
   */
  async deleteAttribute(adminId: string, attributeId: string) {
    const existing = await this.prisma.attribute.findUnique({
      where: { id: attributeId },
      include: { _count: { select: { productAttributes: true } } },
    });

    if (!existing) {
      throw new NotFoundException('Özellik değeri bulunamadı');
    }

    if (existing._count.productAttributes > 0) {
      throw new BadRequestException(`Bu özellik ${existing._count.productAttributes} üründe kullanılıyor. Önce ürünlerden kaldırın.`);
    }

    await this.prisma.attribute.delete({
      where: { id: attributeId },
    });

    await this.createAuditLog(adminId, 'attribute_delete', 'Attribute', attributeId, existing, null);

    return { success: true };
  }

  // ==================== REVIEWS & RATINGS ====================

  /**
   * Get product reviews
   */
  async getReviews(query: RatingQueryDto) {
    const { page = 1, limit = 20, status, productId, search, sortBy } = query;

    const where: any = {};

    if (status) {
      where.status = status;
    }

    if (productId) {
      where.productId = productId;
    }

    if (search) {
      const [ratingIds, userIds, productIds] = await Promise.all([
        fulltextProductRatingSearch(this.prisma, search),
        fulltextUserDisplayNameSearch(this.prisma, search),
        fulltextProductSearch(this.prisma, search),
      ]);
      const conditions: any[] = [];
      if (ratingIds.length > 0) conditions.push({ id: { in: ratingIds } });
      if (userIds.length > 0) conditions.push({ userId: { in: userIds } });
      if (productIds.length > 0) conditions.push({ productId: { in: productIds } });
      if (conditions.length === 0) {
        return { data: [], total: 0, page, limit, totalPages: 0 };
      }
      where.OR = conditions;
    }

    const orderBy: any = {};
    if (sortBy === 'newest') orderBy.createdAt = 'desc';
    else if (sortBy === 'oldest') orderBy.createdAt = 'asc';
    else if (sortBy === 'highest_score') orderBy.score = 'desc';
    else if (sortBy === 'lowest_score') orderBy.score = 'asc';
    else orderBy.createdAt = 'desc';

    const [total, reviews] = await Promise.all([
      this.prisma.productRating.count({ where }),
      this.prisma.productRating.findMany({
        where,
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
        include: {
          user: { select: { id: true, displayName: true, email: true, avatarUrl: true } },
          product: { select: { id: true, title: true, images: { take: 1 } } },
        },
      }),
    ]);

    const resolvedReviews = reviews.map((review: any) => ({
      ...review,
      product: review.product ? {
        ...review.product,
        images: (review.product.images || []).map((img: any) => ({
          ...img,
          url: this.resolveProductImageUrl(img.cardKey) || this.resolveProductImageUrl(img.url) || img.url,
        })),
      } : review.product,
    }));

    return {
      data: resolvedReviews,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Update review status
   */
  async updateReviewStatus(adminId: string, reviewId: string, status: RatingStatus) {
    const review = await this.prisma.productRating.findUnique({
      where: { id: reviewId },
    });

    if (!review) {
      throw new NotFoundException('Yorum bulunamadı');
    }

    // Cast to any to avoid TS error if prisma client is not generated
    const updated = await this.prisma.productRating.update({
      where: { id: reviewId },
      data: { status } as any,
    });

    await this.createAuditLog(adminId, 'review_status_update', 'Rating', reviewId, review, updated);

    await this.ratingService.updateProductRatingStats(review.productId);

    return updated;
  }

  /**
   * Reply to review
   */
  async replyToReview(adminId: string, reviewId: string, reply: string) {
    const review = await this.prisma.productRating.findUnique({
      where: { id: reviewId },
    });

    if (!review) {
      throw new NotFoundException('Yorum bulunamadı');
    }

    const updated = await this.prisma.productRating.update({
      where: { id: reviewId },
      data: {
        adminReply: reply,
        adminReplyAt: new Date(),
        status: RatingStatus.approved as any, // Auto approve if admin replies
      } as any,
    });

    await this.createAuditLog(adminId, 'review_reply', 'Rating', reviewId, review, updated);

    await this.ratingService.updateProductRatingStats(review.productId);

    return updated;
  }

  /**
   * Get seller (user) ratings for admin panel
   */
  async getUserRatings(query: { page?: number; limit?: number; search?: string; status?: string }) {
    const p = Number(query.page) || 1;
    const lim = Number(query.limit) || 20;
    const search = query.search;
    const status = query.status;
    const where: any = {};

    if (search) {
      where.OR = [
        { giver: { displayName: { contains: search, mode: 'insensitive' } } },
        { receiver: { displayName: { contains: search, mode: 'insensitive' } } },
        { comment: { contains: search, mode: 'insensitive' } },
      ];
    }
    if (status && ['pending', 'approved', 'rejected', 'spam'].includes(status)) {
      where.status = status;
    }

    const [total, ratings] = await Promise.all([
      this.prisma.rating.count({ where }),
      this.prisma.rating.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (p - 1) * lim,
        take: lim,
        include: {
          giver: { select: { id: true, displayName: true, email: true } },
          receiver: { select: { id: true, displayName: true, email: true } },
        },
      }),
    ]);

    return {
      data: ratings,
      meta: { total, page: p, limit: lim, totalPages: Math.ceil(total / lim) },
    };
  }

  /**
   * Update seller (user) rating status (approve/reject)
   */
  async updateUserRatingStatus(adminId: string, ratingId: string, status: RatingStatus) {
    const rating = await this.prisma.rating.findUnique({ where: { id: ratingId } });
    if (!rating) throw new NotFoundException('Kullanıcı yorumu bulunamadı');
    const previous = { ...rating };
    await this.prisma.rating.update({
      where: { id: ratingId },
      data: { status },
    });
    await this.createAuditLog(adminId, 'user_rating_status_update', 'Rating', ratingId, previous, { status });
    return { success: true };
  }

  /**
   * Delete a seller (user) rating
   */
  async deleteUserRating(adminId: string, ratingId: string) {
    const rating = await this.prisma.rating.findUnique({ where: { id: ratingId } });
    if (!rating) throw new NotFoundException('Kullanıcı yorumu bulunamadı');
    await this.prisma.rating.delete({ where: { id: ratingId } });
    await this.createAuditLog(adminId, 'user_rating_delete', 'Rating', ratingId, rating, null);
    return { success: true };
  }

  /**
   * Delete review
   */
  async deleteReview(adminId: string, reviewId: string) {
    const review = await this.prisma.productRating.findUnique({
      where: { id: reviewId },
    });

    if (!review) {
      throw new NotFoundException('Yorum bulunamadı');
    }

    await this.prisma.productRating.delete({
      where: { id: reviewId },
    });

    await this.createAuditLog(adminId, 'review_delete', 'Rating', reviewId, review, null);

    await this.ratingService.updateProductRatingStats(review.productId);

    return { success: true };
  }
}

