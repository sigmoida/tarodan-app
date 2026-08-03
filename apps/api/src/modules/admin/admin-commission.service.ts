import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from "@nestjs/common";
import {
  CommissionRuleType,
  CommissionSellerType,
  CommissionAppliesTo,
  CommissionTaxpayerType,
} from "@prisma/client";
import { PrismaService } from "../../prisma";
import {
  calculateCommissionFromRules,
  CommissionRuleForCalculation,
  isCatchAllCommissionRule,
} from "../order/order-commission.helper";
import { AdminAuditService } from "./admin-audit.service";
import {
  CreateCommissionRuleDto,
  PreviewCommissionDto,
  UpdateCommissionRuleDto,
} from "./dto";

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
      include: {
        category: { select: { id: true, name: true } },
        shippingShares: true,
      },
      orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
    });

    return rules.map((r) => this.serializeRule(r));
  }

  /**
   * @deprecated Legacy single-rate preview — NOT wired to any UI (the admin rule
   * form uses the client-side `BreakdownPreview`, which reflects the full v2
   * rates/taxpayer/amount/shipping). This builds the draft from only the old
   * `sellerRate/buyerRate` fields and calls the engine via the legacy positional
   * overload, so it would reproduce the old preview != checkout drift. Do not
   * re-wire it; either delete it or upgrade it to the v2 draft before reuse.
   */
  async previewCommission(dto: PreviewCommissionDto) {
    const activeRules = await this.prisma.commissionRule.findMany({
      where: { isActive: true },
    });
    const rules: CommissionRuleForCalculation[] = activeRules.filter(
      (rule) => rule.id !== dto.ruleId,
    );

    if (dto.isActive !== false) {
      rules.unshift({
        id: dto.ruleId ?? "commission-preview-draft",
        name: "Taslak komisyon kuralı",
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
  /** Ranges overlap if aLo <= bHi && bLo <= aHi (null bounds = ±infinity). */
  private rangesOverlap(
    aMin: number | null,
    aMax: number | null,
    bMin: number | null,
    bMax: number | null,
  ): boolean {
    const aLo = aMin ?? -Infinity;
    const aHi = aMax ?? Infinity;
    const bLo = bMin ?? -Infinity;
    const bHi = bMax ?? Infinity;
    return aLo <= bHi && bLo <= aHi;
  }

  /**
   * v2 çoklu-kural: MOTORUN belirsizlik tanımıyla aynı denetim. Motor iki tarafı
   * ayrı eşleştirir (satıcı tarafı SELLER∪BOTH, alıcı tarafı BUYER∪BOTH) ve
   * null/ALL/all değerlerini joker sayar. Dolayısıyla iki kural ancak şu dördü
   * birden sağlanırsa belirsizlik üretir ve reddedilmelidir:
   *   1. normalize eksenleri AYNI (kategori değeri; satıcı tipi joker≡joker ya
   *      da aynı özel değer; vergi tipi için aynısı),
   *   2. appliesTo tarafları KESİŞİYOR (SELLER↔BOTH, BUYER↔BOTH, BOTH↔hepsi),
   *   3. tutar aralıkları çakışıyor,
   *   4. ikisi de aktif.
   * Farklı özgüllükteki kurallar (örn. kategorili × kategori jokeri) motor
   * tarafından skorla ayrıştığı için serbesttir. Eksen filtreleri BİLEREK
   * JS'te: Prisma `where` eşitliği null≡ALL eş anlamlılığını göremez.
   */
  private async assertNoRangeOverlap(params: {
    categoryId: string | null;
    sellerType: CommissionSellerType | null;
    taxpayerType: CommissionTaxpayerType | null;
    appliesTo: CommissionAppliesTo;
    minAmount: number | null;
    maxAmount: number | null;
    excludeId?: string;
  }) {
    const normalizeSeller = (v: CommissionSellerType | null) =>
      v == null || v === CommissionSellerType.ALL ? null : v;
    const normalizeTaxpayer = (v: CommissionTaxpayerType | null) =>
      v == null || v === CommissionTaxpayerType.all ? null : v;
    const sides = (v: CommissionAppliesTo): CommissionAppliesTo[] =>
      v === CommissionAppliesTo.BOTH
        ? [CommissionAppliesTo.SELLER, CommissionAppliesTo.BUYER]
        : [v];
    const sidesIntersect = (a: CommissionAppliesTo, b: CommissionAppliesTo) =>
      sides(a).some((side) => sides(b).includes(side));

    const siblings = await this.prisma.commissionRule.findMany({
      where: {
        isActive: true,
        ...(params.excludeId ? { id: { not: params.excludeId } } : {}),
      },
      select: {
        id: true,
        categoryId: true,
        sellerType: true,
        taxpayerType: true,
        appliesTo: true,
        minAmount: true,
        maxAmount: true,
      },
    });

    const clash = siblings.find(
      (s) =>
        s.categoryId === params.categoryId &&
        normalizeSeller(s.sellerType) === normalizeSeller(params.sellerType) &&
        normalizeTaxpayer(s.taxpayerType) ===
          normalizeTaxpayer(params.taxpayerType) &&
        sidesIntersect(s.appliesTo, params.appliesTo) &&
        this.rangesOverlap(
          params.minAmount,
          params.maxAmount,
          s.minAmount != null ? Number(s.minAmount) : null,
          s.maxAmount != null ? Number(s.maxAmount) : null,
        ),
    );
    if (clash) {
      throw new BadRequestException(
        "Aynı kategori / satıcı tipi / vergi tipi ekseninde, uygulanan tarafı ve tutar aralığı çakışan aktif bir kural zaten var. " +
          "Hangi kuralın uygulanacağı belirsizleşeceği için önce mevcut kuralı düzenleyin veya aralıkları ayırın.",
      );
    }
  }

  /** v2 kesinti oranları/limitleri — create ve update ortak eşlemesi. */
  private v2RuleData(
    dto: CreateCommissionRuleDto | UpdateCommissionRuleDto,
  ): Record<string, unknown> {
    const keys = [
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
    ] as const;
    const data: Record<string, unknown> = {};
    for (const k of keys) {
      if ((dto as any)[k] !== undefined) data[k] = (dto as any)[k];
    }
    if (dto.taxpayerType !== undefined) data.taxpayerType = dto.taxpayerType;
    if (dto.maxAmount !== undefined) data.maxAmount = dto.maxAmount;
    if (dto.shippingBuyerShare !== undefined)
      data.shippingBuyerShare = dto.shippingBuyerShare;
    // Takas sabit ücretleri (KDV dahil): kuralın oran alanlarından bağımsızdır,
    // yalnız takas fiyatlaması okur.
    if (dto.tradeFeeSellerAmount !== undefined)
      data.tradeFeeSellerAmount = dto.tradeFeeSellerAmount;
    if (dto.tradeFeeBuyerAmount !== undefined)
      data.tradeFeeBuyerAmount = dto.tradeFeeBuyerAmount;
    return data;
  }

  /**
   * Yazılacak kademe payı satırları. Alan gönderilmediyse `undefined` döner ve
   * mevcut satırlara DOKUNULMAZ (kısmi gönderim sessizce yarım yapılandırma
   * bırakmasın diye gönderildiğinde tam liste yazılır).
   */
  private shippingShareRows(
    dto: CreateCommissionRuleDto | UpdateCommissionRuleDto,
  ) {
    if (dto.shippingShares === undefined) return undefined;
    return dto.shippingShares.map((share) => ({
      tierCode: share.tierCode,
      buyerShare: share.buyerShare,
    }));
  }

  /**
   * Create yolunda nested `deleteMany` GEÇERSİZDİR (Prisma yalnız update'te
   * kabul eder) ve silinecek satır da yoktur — sadece `create` gönderilir.
   */
  private shippingSharesCreateData(dto: CreateCommissionRuleDto) {
    const create = this.shippingShareRows(dto);
    return create ? { create } : undefined;
  }

  /** Update yolunda mevcut satırlar silinip tam liste yeniden yazılır. */
  private shippingSharesUpdateData(dto: UpdateCommissionRuleDto) {
    const create = this.shippingShareRows(dto);
    return create ? { deleteMany: {}, create } : undefined;
  }

  private serializeRule(rule: any) {
    const num = (v: any) => (v != null ? Number(v) : null);
    return {
      id: rule.id,
      name: rule.name,
      categoryId: rule.categoryId,
      categoryName: rule.category?.name || null,
      sellerType: rule.sellerType,
      appliesTo: rule.appliesTo,
      taxpayerType: rule.taxpayerType,
      minAmount: num(rule.minAmount),
      maxAmount: num(rule.maxAmount),
      sellerRate: num(rule.sellerRate),
      buyerRate: num(rule.buyerRate),
      sellerMin: num(rule.sellerMin),
      sellerMax: num(rule.sellerMax),
      buyerMin: num(rule.buyerMin),
      buyerMax: num(rule.buyerMax),
      buyerCommissionRate: num(rule.buyerCommissionRate),
      buyerCommissionMin: num(rule.buyerCommissionMin),
      buyerCommissionMax: num(rule.buyerCommissionMax),
      buyerServiceFeeRate: num(rule.buyerServiceFeeRate),
      buyerServiceFeeMin: num(rule.buyerServiceFeeMin),
      buyerServiceFeeMax: num(rule.buyerServiceFeeMax),
      sellerCommissionRate: num(rule.sellerCommissionRate),
      sellerCommissionMin: num(rule.sellerCommissionMin),
      sellerCommissionMax: num(rule.sellerCommissionMax),
      sellerPlatformFeeRate: num(rule.sellerPlatformFeeRate),
      sellerPlatformFeeMin: num(rule.sellerPlatformFeeMin),
      sellerPlatformFeeMax: num(rule.sellerPlatformFeeMax),
      shippingBuyerShare: num(rule.shippingBuyerShare),
      tradeFeeSellerAmount: num(rule.tradeFeeSellerAmount),
      tradeFeeBuyerAmount: num(rule.tradeFeeBuyerAmount),
      // Paket boyutu başına pay: admin formu bunları okur; satır yoksa tek pay geçerli.
      shippingShares: (rule.shippingShares ?? []).map(
        (share: { tierCode: string; buyerShare: unknown }) => ({
          tierCode: share.tierCode,
          buyerShare: Number(share.buyerShare),
        }),
      ),
      priority: rule.priority,
      isActive: rule.isActive,
      createdAt: rule.createdAt,
      updatedAt: rule.updatedAt,
      // Legacy
      percentage: num(rule.percentage),
      type: rule.ruleType,
    };
  }

  async createCommissionRule(adminId: string, dto: CreateCommissionRuleDto) {
    // En az bir kesinti oranı verilmeli (legacy veya v2).
    const anyRate = [
      dto.sellerRate,
      dto.buyerRate,
      dto.buyerCommissionRate,
      dto.buyerServiceFeeRate,
      dto.sellerCommissionRate,
      dto.sellerPlatformFeeRate,
    ].some((r) => r != null);
    if (!anyRate) {
      throw new BadRequestException("En az bir kesinti oranı girmelisiniz.");
    }

    // min <= max sanity (legacy floors/caps + amount range)
    const pairs: Array<[number | undefined, number | undefined, string]> = [
      [dto.sellerMin, dto.sellerMax, "sellerMin/sellerMax"],
      [dto.buyerMin, dto.buyerMax, "buyerMin/buyerMax"],
      [dto.minAmount, dto.maxAmount, "minAmount/maxAmount"],
    ];
    for (const [min, max, label] of pairs) {
      if (min != null && max != null && min > max) {
        throw new BadRequestException(
          `${label}: alt sınır üst sınırdan büyük olamaz`,
        );
      }
    }

    const categoryId =
      dto.categoryId && dto.categoryId.trim() !== "" ? dto.categoryId : null;
    const taxpayerType = dto.taxpayerType ?? CommissionTaxpayerType.all;

    await this.assertNoRangeOverlap({
      categoryId,
      sellerType: dto.sellerType,
      taxpayerType,
      appliesTo: dto.appliesTo,
      minAmount: dto.minAmount ?? null,
      maxAmount: dto.maxAmount ?? null,
    });

    const rule = await this.prisma.commissionRule.create({
      data: {
        name: dto.name,
        categoryId,
        sellerType: dto.sellerType,
        appliesTo: dto.appliesTo,
        taxpayerType,
        sellerRate: dto.sellerRate ?? null,
        buyerRate: dto.buyerRate ?? null,
        sellerMin: dto.sellerMin ?? null,
        sellerMax: dto.sellerMax ?? null,
        buyerMin: dto.buyerMin ?? null,
        buyerMax: dto.buyerMax ?? null,
        priority: dto.priority ?? 0,
        isActive: dto.isActive ?? true,
        ...this.v2RuleData(dto),
        shippingShares: this.shippingSharesCreateData(dto),
        // Legacy (backward compatibility)
        percentage: dto.percentage ?? (dto.sellerRate || 0),
        ruleType: dto.type || "default",
        minAmount: dto.minAmount,
      },
      include: {
        category: { select: { id: true, name: true } },
        shippingShares: true,
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
  }

  /**
   * Update commission rule
   */
  async updateCommissionRule(
    adminId: string,
    ruleId: string,
    dto: UpdateCommissionRuleDto,
  ) {
    const existing = await this.prisma.commissionRule.findUnique({
      where: { id: ruleId },
    });

    if (!existing) {
      throw new NotFoundException("Komisyon kuralı bulunamadı");
    }

    // Determine final appliesTo value (v2: rate requirements are lenient — a rule
    // may carry legacy OR v2 rates; the engine falls back appropriately).
    const appliesTo = dto.appliesTo ?? existing.appliesTo ?? "SELLER";

    // Validate min <= max
    const sellerMin =
      dto.sellerMin !== undefined ? dto.sellerMin : existing.sellerMin;
    const sellerMax =
      dto.sellerMax !== undefined ? dto.sellerMax : existing.sellerMax;
    if (sellerMin != null && sellerMax != null && sellerMin > sellerMax) {
      throw new BadRequestException(
        "sellerMin cannot be greater than sellerMax",
      );
    }

    const buyerMin =
      dto.buyerMin !== undefined ? dto.buyerMin : existing.buyerMin;
    const buyerMax =
      dto.buyerMax !== undefined ? dto.buyerMax : existing.buyerMax;
    if (buyerMin != null && buyerMax != null && buyerMin > buyerMax) {
      throw new BadRequestException("buyerMin cannot be greater than buyerMax");
    }

    // Determine final categoryId and sellerType
    const finalCategoryId =
      dto.categoryId !== undefined
        ? dto.categoryId && dto.categoryId.trim() !== ""
          ? dto.categoryId
          : null
        : existing.categoryId;
    const finalSellerType =
      dto.sellerType !== undefined ? dto.sellerType : existing.sellerType;
    const finalTaxpayerType =
      dto.taxpayerType !== undefined ? dto.taxpayerType : existing.taxpayerType;
    const finalMinAmount =
      dto.minAmount !== undefined
        ? dto.minAmount
        : existing.minAmount != null
          ? Number(existing.minAmount)
          : null;
    const finalMaxAmount =
      dto.maxAmount !== undefined
        ? dto.maxAmount
        : existing.maxAmount != null
          ? Number(existing.maxAmount)
          : null;

    // v2: aynı (kategori × satıcı tipi × vergi tipi × appliesTo) ekseninde tutar
    // aralıkları çakışmamalı (çoklu kural serbest ama belirsizlik yasak).
    await this.assertNoRangeOverlap({
      categoryId: finalCategoryId,
      sellerType: finalSellerType as CommissionSellerType,
      taxpayerType: finalTaxpayerType,
      appliesTo: appliesTo as CommissionAppliesTo,
      minAmount: finalMinAmount ?? null,
      maxAmount: finalMaxAmount ?? null,
      excludeId: existing.id,
    });

    // Son aktif catch-all kural pasife alınamaz veya catch-all kapsamından
    // çıkarılamaz (kategori/tutar/appliesTo daraltarak da olsa).
    const staysCatchAll =
      (dto.isActive === undefined ? existing.isActive : dto.isActive) &&
      isCatchAllCommissionRule({
        categoryId: finalCategoryId,
        sellerType: finalSellerType as CommissionSellerType,
        taxpayerType: finalTaxpayerType,
        minAmount: finalMinAmount ?? null,
        maxAmount: finalMaxAmount ?? null,
        appliesTo: appliesTo as CommissionAppliesTo,
      });
    if (existing.isActive && !staysCatchAll) {
      await this.assertCatchAllRuleSurvives(existing);
    }

    // Prepare update data
    const updateData: any = {};
    if (dto.name !== undefined) updateData.name = dto.name;
    if (dto.categoryId !== undefined) {
      updateData.categoryId =
        dto.categoryId && dto.categoryId.trim() !== "" ? dto.categoryId : null;
    }
    if (dto.sellerType !== undefined) updateData.sellerType = dto.sellerType;
    if (dto.appliesTo !== undefined) updateData.appliesTo = dto.appliesTo;
    if (dto.sellerRate !== undefined) updateData.sellerRate = dto.sellerRate;
    if (dto.buyerRate !== undefined) updateData.buyerRate = dto.buyerRate;
    if (dto.sellerMin !== undefined) updateData.sellerMin = dto.sellerMin;
    if (dto.sellerMax !== undefined) updateData.sellerMax = dto.sellerMax;
    if (dto.buyerMin !== undefined) updateData.buyerMin = dto.buyerMin;
    if (dto.buyerMax !== undefined) updateData.buyerMax = dto.buyerMax;
    if (dto.priority !== undefined) updateData.priority = dto.priority;
    if (dto.isActive !== undefined) updateData.isActive = dto.isActive;
    // v2 fields (taxpayerType, maxAmount, 4 rate sets, shippingBuyerShare)
    Object.assign(updateData, this.v2RuleData(dto));
    const shippingShares = this.shippingSharesUpdateData(dto);
    if (shippingShares) updateData.shippingShares = shippingShares;
    // Legacy fields
    if (dto.percentage !== undefined) updateData.percentage = dto.percentage;
    if (dto.type !== undefined) updateData.ruleType = dto.type;
    if (dto.minAmount !== undefined) updateData.minAmount = dto.minAmount;

    const rule = await this.prisma.commissionRule.update({
      where: { id: ruleId },
      data: updateData,
      include: {
        category: { select: { id: true, name: true } },
        shippingShares: true,
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
  }

  /**
   * En az bir AKTİF catch-all kuralın kalmasını garanti eder. Catch-all yoksa
   * eşleşmeyen her kategori/tutar kombinasyonu checkout'ta fail-closed 503
   * verir — yani sepet ödenemez hale gelir. Bu yüzden son catch-all kuralın
   * silinmesi/pasife alınması engellenir.
   */
  private async assertCatchAllRuleSurvives(
    rule: Parameters<typeof isCatchAllCommissionRule>[0] & { id: string },
  ): Promise<void> {
    if (!isCatchAllCommissionRule(rule)) return;

    const otherActiveCatchAll = (
      await this.prisma.commissionRule.findMany({
        where: {
          isActive: true,
          id: { not: rule.id },
          categoryId: null,
          minAmount: null,
          maxAmount: null,
          appliesTo: CommissionAppliesTo.BOTH,
        },
      })
    ).some((candidate) => isCatchAllCommissionRule(candidate));

    if (!otherActiveCatchAll) {
      throw new BadRequestException(
        "Son aktif genel (catch-all) komisyon kuralı kaldırılamaz veya pasife alınamaz — " +
          "aksi halde eşleşen kuralı olmayan siparişler ödeme adımında hata verir. " +
          "Önce yerine geçecek yeni bir genel kural tanımlayın.",
      );
    }
  }

  /**
   * Delete commission rule
   */
  async deleteCommissionRule(adminId: string, ruleId: string) {
    const existing = await this.prisma.commissionRule.findUnique({
      where: { id: ruleId },
    });

    if (!existing) {
      throw new NotFoundException("Komisyon kuralı bulunamadı");
    }

    if (existing.isActive) {
      await this.assertCatchAllRuleSurvives(existing);
    }

    await this.prisma.commissionRule.delete({
      where: { id: ruleId },
    });

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

  // ==================== TAKAS KOMİSYONU (ayarlanabilir oran) ====================

  /** Takas nakit farkı komisyon oranı (%). PlatformSetting 'trade_commission_rate', varsayılan %5. */
  async getTradeCommissionRate(): Promise<{ rate: number }> {
    const row = await this.prisma.platformSetting.findUnique({
      where: { settingKey: "trade_commission_rate" },
    });
    return { rate: Number(row?.settingValue ?? "5") || 5 };
  }

  async setTradeCommissionRate(
    adminId: string,
    rate: number,
  ): Promise<{ rate: number }> {
    if (!(rate >= 0 && rate <= 100)) {
      throw new BadRequestException("Oran 0 ile 100 arasında olmalı");
    }
    await this.prisma.platformSetting.upsert({
      where: { settingKey: "trade_commission_rate" },
      create: {
        settingKey: "trade_commission_rate",
        settingValue: String(rate),
        settingType: "number",
        description: "Takas nakit farkı komisyon oranı (%)",
        updatedBy: adminId,
      },
      update: { settingValue: String(rate), updatedBy: adminId },
    });
    await this.audit.createRequiredAuditLog(
      adminId,
      "trade_commission_rate_update",
      "PlatformSetting",
      "trade_commission_rate",
      null,
      { rate },
    );
    return { rate };
  }
}
