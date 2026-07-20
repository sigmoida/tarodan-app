import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { CommissionRuleType } from '@prisma/client';
import { PrismaService } from '../../prisma';
import {
  calculateCommissionFromRules,
  CommissionRuleForCalculation,
} from '../order/order-commission.helper';
import { AdminAuditService } from './admin-audit.service';
import { CreateCommissionRuleDto, PreviewCommissionDto, UpdateCommissionRuleDto } from './dto';

/**
 * Komisyon kuralları yönetimi — AdminService'in COMMISSION RULES bölümünden
 * birebir taşındı. AdminService aynı imzalarla buraya delege eder.
 */
@Injectable()
export class AdminCommissionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AdminAuditService,
  ) {}

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

  /** Quote an unsaved draft with the exact independent matching used at checkout. */
  async previewCommission(dto: PreviewCommissionDto) {
    const activeRules = await this.prisma.commissionRule.findMany({
      where: { isActive: true },
    });
    const rules: CommissionRuleForCalculation[] = activeRules.filter(
      (rule) => rule.id !== dto.ruleId,
    );

    if (dto.isActive !== false) {
      rules.unshift({
        id: dto.ruleId ?? 'commission-preview-draft',
        name: 'Taslak komisyon kuralı',
        ruleType: CommissionRuleType.default,
        categoryId: dto.categoryId?.trim() || null,
        sellerType: dto.sellerType,
        appliesTo: dto.appliesTo,
        sellerRate: dto.sellerRate,
        buyerRate: dto.buyerRate,
        sellerMin: dto.sellerMin,
        sellerMax: dto.sellerMax,
        buyerMin: dto.buyerMin,
        buyerMax: dto.buyerMax,
      });
    }

    return calculateCommissionFromRules(
      dto.amount,
      rules,
      dto.previewCategoryId?.trim() || null,
      dto.previewSellerType,
    );
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

    // Check if a rule with the same combination already exists.
    // appliesTo da eşleşmeli: alıcı ve satıcı kuralı aynı kategori+tip için ayrı taraflara uygulanır.
    const existingRule = await this.prisma.commissionRule.findFirst({
      where: {
        categoryId: categoryId,
        sellerType: dto.sellerType,
        appliesTo: dto.appliesTo as any,
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
    await this.audit.createAuditLog(adminId, 'commission_rule_create', 'CommissionRule', rule.id, null, rule);

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

    // Check if changing categoryId or sellerType would conflict with another rule.
    // NOT: appliesTo (SELLER/BUYER/BOTH) da eşleşmeli — alıcı hizmet bedeli kuralı ile
    // satıcı komisyon kuralı aynı kategori+satıcı tipinde ayrı taraflara uygulanır, ÇAKIŞMAZ.
    if ((dto.categoryId !== undefined || dto.sellerType !== undefined || dto.appliesTo !== undefined) &&
      (finalCategoryId !== existing.categoryId || finalSellerType !== existing.sellerType || appliesTo !== existing.appliesTo)) {
      const conflictingRule = await this.prisma.commissionRule.findFirst({
        where: {
          categoryId: finalCategoryId,
          sellerType: finalSellerType,
          appliesTo: appliesTo as any,
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

    await this.audit.createAuditLog(adminId, 'commission_rule_update', 'CommissionRule', rule.id, existing, rule);

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

    await this.audit.createAuditLog(adminId, 'commission_rule_delete', 'CommissionRule', ruleId, existing, null);

    return { success: true };
  }

  // ==================== TAKAS KOMİSYONU (ayarlanabilir oran) ====================

  /** Takas nakit farkı komisyon oranı (%). PlatformSetting 'trade_commission_rate', varsayılan %5. */
  async getTradeCommissionRate(): Promise<{ rate: number }> {
    const row = await this.prisma.platformSetting.findUnique({ where: { settingKey: 'trade_commission_rate' } });
    return { rate: Number(row?.settingValue ?? '5') || 5 };
  }

  async setTradeCommissionRate(adminId: string, rate: number): Promise<{ rate: number }> {
    if (!(rate >= 0 && rate <= 100)) {
      throw new BadRequestException('Oran 0 ile 100 arasında olmalı');
    }
    await this.prisma.platformSetting.upsert({
      where: { settingKey: 'trade_commission_rate' },
      create: {
        settingKey: 'trade_commission_rate',
        settingValue: String(rate),
        settingType: 'number',
        description: 'Takas nakit farkı komisyon oranı (%)',
        updatedBy: adminId,
      },
      update: { settingValue: String(rate), updatedBy: adminId },
    });
    await this.audit.createAuditLog(adminId, 'trade_commission_rate_update', 'PlatformSetting', 'trade_commission_rate', null, { rate });
    return { rate };
  }
}
