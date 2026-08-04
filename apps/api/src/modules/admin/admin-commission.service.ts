import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { CommissionRuleSetStatus, Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma";
import {
  calculateCommissionFromRules,
  CommissionRuleMatchError,
  roundCommissionMatchAmount,
  validateStrictCommissionCoverage,
} from "../order/order-commission.helper";
import { AdminAuditService } from "./admin-audit.service";
import {
  CreateCommissionRuleDto,
  CreateCommissionRuleSetDto,
  PreviewCommissionDto,
  UpdateCommissionRuleDto,
} from "./dto";

type DbClient = Prisma.TransactionClient | PrismaService;

@Injectable()
export class AdminCommissionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AdminAuditService,
  ) {}

  private serializeRule(rule: any) {
    const numberOrNull = (value: unknown) =>
      value == null ? null : Number(value);
    return {
      id: rule.id,
      ruleSetId: rule.ruleSetId,
      name: rule.name,
      categoryId: rule.categoryId,
      categoryName: rule.category?.name ?? null,
      sellerType: rule.sellerType,
      minAmount: Number(rule.minAmount),
      maxAmount: numberOrNull(rule.maxAmount),
      buyerCommissionRate: Number(rule.buyerCommissionRate),
      buyerCommissionMin: numberOrNull(rule.buyerCommissionMin),
      buyerCommissionMax: numberOrNull(rule.buyerCommissionMax),
      buyerServiceFeeRate: Number(rule.buyerServiceFeeRate),
      buyerServiceFeeMin: numberOrNull(rule.buyerServiceFeeMin),
      buyerServiceFeeMax: numberOrNull(rule.buyerServiceFeeMax),
      sellerCommissionRate: Number(rule.sellerCommissionRate),
      sellerCommissionMin: numberOrNull(rule.sellerCommissionMin),
      sellerCommissionMax: numberOrNull(rule.sellerCommissionMax),
      sellerPlatformFeeRate: Number(rule.sellerPlatformFeeRate),
      sellerPlatformFeeMin: numberOrNull(rule.sellerPlatformFeeMin),
      sellerPlatformFeeMax: numberOrNull(rule.sellerPlatformFeeMax),
      tradeFeeSellerAmount: Number(rule.tradeFeeSellerAmount),
      tradeFeeBuyerAmount: Number(rule.tradeFeeBuyerAmount),
      shippingBuyerShare: Number(rule.shippingBuyerShare),
      shippingShares: (rule.shippingShares ?? []).map((share: any) => ({
        tierCode: share.tierCode,
        buyerShare: Number(share.buyerShare),
      })),
      ruleSet: rule.ruleSet
        ? {
            id: rule.ruleSet.id,
            name: rule.ruleSet.name,
            version: rule.ruleSet.version,
            status: rule.ruleSet.status,
          }
        : undefined,
      createdAt: rule.createdAt,
      updatedAt: rule.updatedAt,
    };
  }

  async getCommissionRuleSets() {
    return this.prisma.commissionRuleSet.findMany({
      include: { _count: { select: { rules: true } } },
      orderBy: { version: "desc" },
    });
  }

  /** Admin grid works on the sole draft; without a draft it shows active rules. */
  async getCommissionRules(ruleSetId?: string) {
    const selectedSet = ruleSetId
      ? await this.prisma.commissionRuleSet.findUnique({
          where: { id: ruleSetId },
        })
      : ((await this.prisma.commissionRuleSet.findFirst({
          where: { status: CommissionRuleSetStatus.DRAFT },
          orderBy: { version: "desc" },
        })) ??
        (await this.prisma.commissionRuleSet.findFirst({
          where: { status: CommissionRuleSetStatus.ACTIVE },
        })));

    if (!selectedSet) return [];
    const rules = await this.prisma.commissionRule.findMany({
      where: { ruleSetId: selectedSet.id },
      include: {
        category: { select: { id: true, name: true } },
        shippingShares: true,
        ruleSet: true,
      },
      orderBy: [
        { category: { name: "asc" } },
        { sellerType: "asc" },
        { minAmount: "asc" },
      ],
    });
    return rules.map((rule) => this.serializeRule(rule));
  }

  async createDraftRuleSet(adminId: string, dto: CreateCommissionRuleSetDto) {
    const existingDraft = await this.prisma.commissionRuleSet.findFirst({
      where: { status: CommissionRuleSetStatus.DRAFT },
      include: { _count: { select: { rules: true } } },
    });
    if (existingDraft) return existingDraft;

    const created = await this.prisma.$transaction(async (tx) => {
      const [latest, active] = await Promise.all([
        tx.commissionRuleSet.aggregate({ _max: { version: true } }),
        tx.commissionRuleSet.findFirst({
          where: { status: CommissionRuleSetStatus.ACTIVE },
          include: { rules: { include: { shippingShares: true } } },
        }),
      ]);
      const version = (latest._max.version ?? 0) + 1;
      const draft = await tx.commissionRuleSet.create({
        data: {
          name: dto.name?.trim() || `Komisyon Seti v${version}`,
          version,
          status: CommissionRuleSetStatus.DRAFT,
        },
      });

      for (const source of active?.rules ?? []) {
        await tx.commissionRule.create({
          data: {
            ruleSetId: draft.id,
            name: source.name,
            categoryId: source.categoryId,
            sellerType: source.sellerType,
            minAmount: source.minAmount,
            maxAmount: source.maxAmount,
            buyerCommissionRate: source.buyerCommissionRate,
            buyerCommissionMin: source.buyerCommissionMin,
            buyerCommissionMax: source.buyerCommissionMax,
            buyerServiceFeeRate: source.buyerServiceFeeRate,
            buyerServiceFeeMin: source.buyerServiceFeeMin,
            buyerServiceFeeMax: source.buyerServiceFeeMax,
            sellerCommissionRate: source.sellerCommissionRate,
            sellerCommissionMin: source.sellerCommissionMin,
            sellerCommissionMax: source.sellerCommissionMax,
            sellerPlatformFeeRate: source.sellerPlatformFeeRate,
            sellerPlatformFeeMin: source.sellerPlatformFeeMin,
            sellerPlatformFeeMax: source.sellerPlatformFeeMax,
            tradeFeeSellerAmount: source.tradeFeeSellerAmount,
            tradeFeeBuyerAmount: source.tradeFeeBuyerAmount,
            shippingBuyerShare: source.shippingBuyerShare,
            shippingShares: {
              create: source.shippingShares.map((share) => ({
                tierCode: share.tierCode,
                buyerShare: share.buyerShare,
              })),
            },
          },
        });
      }
      return draft;
    });

    await this.audit.createRequiredAuditLog(
      adminId,
      "commission_rule_set_draft_create",
      "CommissionRuleSet",
      created.id,
      null,
      created,
    );
    return created;
  }

  private async requireDraftSet(ruleSetId?: string) {
    const set = ruleSetId
      ? await this.prisma.commissionRuleSet.findUnique({
          where: { id: ruleSetId },
        })
      : await this.prisma.commissionRuleSet.findFirst({
          where: { status: CommissionRuleSetStatus.DRAFT },
          orderBy: { version: "desc" },
        });
    if (!set) {
      throw new BadRequestException(
        "Önce aktif setten bir komisyon taslağı oluşturun.",
      );
    }
    if (set.status !== CommissionRuleSetStatus.DRAFT) {
      throw new BadRequestException(
        "Yayınlanmış komisyon setleri değiştirilemez; yeni bir taslak oluşturun.",
      );
    }
    return set;
  }

  private validateRuleValues(input: {
    minAmount: number;
    maxAmount?: number | null;
    shippingShares?: Array<{ tierCode: string }>;
    buyerCommissionMin?: unknown;
    buyerCommissionMax?: unknown;
    buyerServiceFeeMin?: unknown;
    buyerServiceFeeMax?: unknown;
    sellerCommissionMin?: unknown;
    sellerCommissionMax?: unknown;
    sellerPlatformFeeMin?: unknown;
    sellerPlatformFeeMax?: unknown;
    buyerCommissionRate?: unknown;
    buyerServiceFeeRate?: unknown;
    sellerCommissionRate?: unknown;
    sellerPlatformFeeRate?: unknown;
  }) {
    if (input.maxAmount != null && input.maxAmount <= input.minAmount) {
      throw new BadRequestException(
        "Fiyat üst sınırı alt sınırdan büyük olmalıdır. Üst sınır aralığa dahil değildir.",
      );
    }
    const feePairs = [
      [input.buyerCommissionMin, input.buyerCommissionMax],
      [input.buyerServiceFeeMin, input.buyerServiceFeeMax],
      [input.sellerCommissionMin, input.sellerCommissionMax],
      [input.sellerPlatformFeeMin, input.sellerPlatformFeeMax],
    ];
    if (
      feePairs.some(
        ([min, max]) => min != null && max != null && Number(max) < Number(min),
      )
    ) {
      throw new BadRequestException(
        "Ücret tavanı ilgili ücret tabanından küçük olamaz.",
      );
    }
    const feeRatesAndBounds = [
      [
        input.buyerCommissionRate,
        input.buyerCommissionMin,
        input.buyerCommissionMax,
      ],
      [
        input.buyerServiceFeeRate,
        input.buyerServiceFeeMin,
        input.buyerServiceFeeMax,
      ],
      [
        input.sellerCommissionRate,
        input.sellerCommissionMin,
        input.sellerCommissionMax,
      ],
      [
        input.sellerPlatformFeeRate,
        input.sellerPlatformFeeMin,
        input.sellerPlatformFeeMax,
      ],
    ];
    if (
      feeRatesAndBounds.some(
        ([rate, min, max]) =>
          Number(rate) === 0 &&
          ((min != null && Number(min) > 0) ||
            (max != null && Number(max) > 0)),
      )
    ) {
      throw new BadRequestException(
        "Oran %0 iken pozitif ücret tabanı veya tavanı tanımlanamaz.",
      );
    }
    const tierCodes = (input.shippingShares ?? []).map((share) =>
      String(share.tierCode),
    );
    if (new Set(tierCodes).size !== tierCodes.length) {
      throw new BadRequestException(
        "Aynı kargo paket boyutu bir kuralda birden fazla kez tanımlanamaz.",
      );
    }
  }

  private isOverlapConstraint(error: unknown): boolean {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError)) {
      return String(error).includes("commission_rules_no_overlap");
    }
    const details = `${error.message} ${JSON.stringify(error.meta ?? {})}`;
    return (
      error.code === "P2002" ||
      (error.code === "P2004" &&
        details.includes("commission_rules_no_overlap"))
    );
  }

  async createCommissionRule(adminId: string, dto: CreateCommissionRuleDto) {
    const set = await this.requireDraftSet(dto.ruleSetId);
    this.validateRuleValues(dto);
    try {
      const rule = await this.prisma.commissionRule.create({
        data: {
          ruleSetId: set.id,
          name: dto.name.trim(),
          categoryId: dto.categoryId,
          sellerType: dto.sellerType,
          minAmount: dto.minAmount,
          maxAmount: dto.maxAmount ?? null,
          buyerCommissionRate: dto.buyerCommissionRate,
          buyerCommissionMin: dto.buyerCommissionMin ?? null,
          buyerCommissionMax: dto.buyerCommissionMax ?? null,
          buyerServiceFeeRate: dto.buyerServiceFeeRate,
          buyerServiceFeeMin: dto.buyerServiceFeeMin ?? null,
          buyerServiceFeeMax: dto.buyerServiceFeeMax ?? null,
          sellerCommissionRate: dto.sellerCommissionRate,
          sellerCommissionMin: dto.sellerCommissionMin ?? null,
          sellerCommissionMax: dto.sellerCommissionMax ?? null,
          sellerPlatformFeeRate: dto.sellerPlatformFeeRate,
          sellerPlatformFeeMin: dto.sellerPlatformFeeMin ?? null,
          sellerPlatformFeeMax: dto.sellerPlatformFeeMax ?? null,
          tradeFeeSellerAmount: dto.tradeFeeSellerAmount,
          tradeFeeBuyerAmount: dto.tradeFeeBuyerAmount,
          shippingBuyerShare: dto.shippingBuyerShare ?? 100,
          shippingShares: dto.shippingShares
            ? { create: dto.shippingShares }
            : undefined,
        },
        include: {
          category: { select: { id: true, name: true } },
          shippingShares: true,
          ruleSet: true,
        },
      });
      await this.audit.createRequiredAuditLog(
        adminId,
        "commission_rule_create",
        "CommissionRule",
        rule.id,
        null,
        rule,
      );
      return this.serializeRule(rule);
    } catch (error) {
      if (this.isOverlapConstraint(error)) {
        throw new ConflictException(
          "Bu kategori ve satıcı tipi için fiyat aralığı mevcut bir taslak kuralla çakışıyor.",
        );
      }
      throw error;
    }
  }

  async updateCommissionRule(
    adminId: string,
    ruleId: string,
    dto: UpdateCommissionRuleDto,
  ) {
    const existing = await this.prisma.commissionRule.findUnique({
      where: { id: ruleId },
      include: { ruleSet: true, shippingShares: true },
    });
    if (!existing) throw new NotFoundException("Komisyon kuralı bulunamadı");
    await this.requireDraftSet(existing.ruleSetId);

    const final = {
      ...existing,
      ...dto,
      minAmount:
        dto.minAmount !== undefined
          ? dto.minAmount
          : Number(existing.minAmount),
      maxAmount:
        dto.maxAmount !== undefined
          ? dto.maxAmount
          : existing.maxAmount == null
            ? null
            : Number(existing.maxAmount),
    };
    this.validateRuleValues(final as any);

    const scalarKeys = [
      "name",
      "categoryId",
      "sellerType",
      "minAmount",
      "maxAmount",
      "buyerCommissionRate",
      "buyerCommissionMin",
      "buyerCommissionMax",
      "buyerServiceFeeRate",
      "buyerServiceFeeMin",
      "buyerServiceFeeMax",
      "sellerCommissionRate",
      "sellerCommissionMin",
      "sellerCommissionMax",
      "sellerPlatformFeeRate",
      "sellerPlatformFeeMin",
      "sellerPlatformFeeMax",
      "tradeFeeSellerAmount",
      "tradeFeeBuyerAmount",
      "shippingBuyerShare",
    ] as const;
    const data: Record<string, unknown> = {};
    for (const key of scalarKeys) {
      if (dto[key] !== undefined) data[key] = dto[key];
    }
    if (dto.shippingShares !== undefined) {
      data.shippingShares = { deleteMany: {}, create: dto.shippingShares };
    }

    try {
      const rule = await this.prisma.commissionRule.update({
        where: { id: ruleId },
        data,
        include: {
          category: { select: { id: true, name: true } },
          shippingShares: true,
          ruleSet: true,
        },
      });
      await this.audit.createRequiredAuditLog(
        adminId,
        "commission_rule_update",
        "CommissionRule",
        rule.id,
        existing,
        rule,
      );
      return this.serializeRule(rule);
    } catch (error) {
      if (this.isOverlapConstraint(error)) {
        throw new ConflictException(
          "Bu değişiklik fiyat aralığını başka bir taslak kuralla çakıştırıyor.",
        );
      }
      throw error;
    }
  }

  async deleteCommissionRule(adminId: string, ruleId: string) {
    const existing = await this.prisma.commissionRule.findUnique({
      where: { id: ruleId },
      include: { ruleSet: true },
    });
    if (!existing) throw new NotFoundException("Komisyon kuralı bulunamadı");
    await this.requireDraftSet(existing.ruleSetId);
    await this.prisma.commissionRule.delete({ where: { id: ruleId } });
    await this.audit.createRequiredAuditLog(
      adminId,
      "commission_rule_delete",
      "CommissionRule",
      ruleId,
      existing,
      null,
    );
    return { success: true };
  }

  private async validateCoverage(client: DbClient, ruleSetId: string) {
    const [categories, rules] = await Promise.all([
      client.category.findMany({
        where: { isActive: true },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      }),
      client.commissionRule.findMany({
        where: { ruleSetId },
        select: {
          id: true,
          categoryId: true,
          sellerType: true,
          minAmount: true,
          maxAmount: true,
        },
      }),
    ]);

    return validateStrictCommissionCoverage(ruleSetId, categories, rules);
  }

  async validateCommissionRuleSet(ruleSetId: string) {
    const set = await this.prisma.commissionRuleSet.findUnique({
      where: { id: ruleSetId },
    });
    if (!set) throw new NotFoundException("Komisyon seti bulunamadı");
    return this.validateCoverage(this.prisma, ruleSetId);
  }

  async publishCommissionRuleSet(adminId: string, ruleSetId: string) {
    const result = await this.prisma.$transaction(
      async (tx) => {
        const set = await tx.commissionRuleSet.findUnique({
          where: { id: ruleSetId },
        });
        if (!set) throw new NotFoundException("Komisyon seti bulunamadı");
        if (set.status !== CommissionRuleSetStatus.DRAFT) {
          throw new BadRequestException("Yalnız taslak set yayınlanabilir.");
        }

        const validation = await this.validateCoverage(tx, ruleSetId);
        if (!validation.valid) {
          throw new BadRequestException({
            message:
              "Komisyon setinde eksik veya kesintili fiyat aralıkları var; yayınlanamadı.",
            validation,
          });
        }

        await tx.commissionRuleSet.updateMany({
          where: { status: CommissionRuleSetStatus.ACTIVE },
          data: { status: CommissionRuleSetStatus.ARCHIVED },
        });
        const published = await tx.commissionRuleSet.update({
          where: { id: ruleSetId },
          data: {
            status: CommissionRuleSetStatus.ACTIVE,
            publishedAt: new Date(),
            publishedBy: adminId,
          },
        });
        return { published, validation };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );

    await this.audit.createRequiredAuditLog(
      adminId,
      "commission_rule_set_publish",
      "CommissionRuleSet",
      ruleSetId,
      null,
      result,
    );
    return result;
  }

  async previewCommission(dto: PreviewCommissionDto) {
    const set = dto.ruleSetId
      ? await this.prisma.commissionRuleSet.findUnique({
          where: { id: dto.ruleSetId },
        })
      : await this.prisma.commissionRuleSet.findFirst({
          where: { status: CommissionRuleSetStatus.ACTIVE },
        });
    if (!set) throw new BadRequestException("Komisyon seti bulunamadı");
    const matchAmount = roundCommissionMatchAmount(dto.amount);
    const rules = await this.prisma.commissionRule.findMany({
      where: {
        ruleSetId: set.id,
        categoryId: dto.categoryId,
        sellerType: dto.sellerType,
        minAmount: { lte: matchAmount },
        OR: [{ maxAmount: null }, { maxAmount: { gt: matchAmount } }],
      },
      include: { shippingShares: true },
    });
    try {
      return calculateCommissionFromRules(dto.amount, rules, {
        ...dto,
        amount: matchAmount,
      });
    } catch (error) {
      if (error instanceof CommissionRuleMatchError) {
        throw new ConflictException({
          message: error.message,
          matchCount: error.matchCount,
          matchingRuleIds: error.matchingRuleIds,
        });
      }
      throw error;
    }
  }
}
