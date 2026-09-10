import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from "@nestjs/common";
import {
  type ElogoInvoiceContext,
  ElogoInvoiceStatus,
  ElogoInvoiceType,
  Prisma,
} from "@prisma/client";
import { PrismaService } from "../../../prisma";
import { AdminAuditService } from "../ops/admin-audit.service";
import { AdminDeletedIdentityService } from "../users/admin-deleted-identity.service";
import { StorageService } from "../../storage/storage.service";
import { ElogoInvoiceQueryDto, SellerUploadedInvoiceQueryDto } from "../dto";
import {
  paginate,
  paginateComputedRows,
  resolveOrderBy,
} from "../../../common/list";
import {
  invoiceDescriptionOf,
  invoiceTypesMatchingDescription,
} from "../../elogo/invoice/invoice-line-description";
import { elogoInvoiceScopeWhere } from "./invoice-scope";
import { isInvoiceDownloadable } from "./invoice-downloadable";
import { i18nMessage } from "../../i18n";

/**
 * Vergi ayarları admin operasyonları (bölgeler, oranlar, kurallar, raporlama) —
 * AdminService'in TAX SETTINGS bölümünden birebir taşındı.
 * AdminService aynı imzalarla buraya delege eder.
 */
@Injectable()
export class AdminTaxService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AdminAuditService,
    private readonly storageService: StorageService,
    private readonly deletedIdentities: AdminDeletedIdentityService,
  ) {}

  // ==================== TAX SETTINGS (Regions, Rates, Rules, Reporting) ====================
  /** Prisma client with Tax models; at runtime may be missing until prisma generate is run */
  private get taxPrisma(): any {
    return this.prisma as any;
  }

  private get hasTaxModels(): boolean {
    return !!(
      this.taxPrisma.taxRegion &&
      this.taxPrisma.taxRate &&
      this.taxPrisma.taxRule
    );
  }

  async getTaxRegions() {
    if (!this.hasTaxModels) return { data: [] };
    const regions = await this.taxPrisma.taxRegion.findMany({
      include: {
        _count: { select: { taxRates: true, taxRules: true } },
      },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
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

  async createTaxRegion(
    adminId: string,
    dto: {
      name: string;
      countryCode: string;
      regionCode?: string;
      isDefault?: boolean;
      sortOrder?: number;
      isActive?: boolean;
    },
  ) {
    if (!this.hasTaxModels)
      throw new BadRequestException(
        "Tax models not available. Run: npx prisma generate (in apps/api)",
      );
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
    await this.audit.createRequiredAuditLog(
      adminId,
      "tax_region_create",
      "TaxRegion",
      region.id,
      null,
      region,
    );
    return region;
  }

  async updateTaxRegion(
    adminId: string,
    id: string,
    dto: {
      name?: string;
      countryCode?: string;
      regionCode?: string;
      isDefault?: boolean;
      sortOrder?: number;
      isActive?: boolean;
    },
  ) {
    if (!this.hasTaxModels)
      throw new BadRequestException(
        "Tax models not available. Run: npx prisma generate (in apps/api)",
      );
    const existing = await this.taxPrisma.taxRegion.findUnique({
      where: { id },
    });
    if (!existing)
      throw new NotFoundException(
        i18nMessage("server.admin.tax.regionNotFound"),
      );
    if (dto.isDefault) {
      await this.taxPrisma.taxRegion.updateMany({ data: { isDefault: false } });
    }
    const region = await this.taxPrisma.taxRegion.update({
      where: { id },
      data: {
        ...(dto.name != null && { name: dto.name }),
        ...(dto.countryCode != null && {
          countryCode: dto.countryCode.toUpperCase(),
        }),
        ...(dto.regionCode !== undefined && {
          regionCode: dto.regionCode || null,
        }),
        ...(dto.isDefault != null && { isDefault: dto.isDefault }),
        ...(dto.sortOrder != null && { sortOrder: dto.sortOrder }),
        ...(dto.isActive != null && { isActive: dto.isActive }),
      },
    });
    await this.audit.createRequiredAuditLog(
      adminId,
      "tax_region_update",
      "TaxRegion",
      id,
      existing,
      region,
    );
    return region;
  }

  async deleteTaxRegion(adminId: string, id: string) {
    if (!this.hasTaxModels)
      throw new BadRequestException(
        "Tax models not available. Run: npx prisma generate (in apps/api)",
      );
    const region = await this.taxPrisma.taxRegion.findUnique({
      where: { id },
      include: { _count: { select: { taxRates: true } } },
    });
    if (!region)
      throw new NotFoundException(
        i18nMessage("server.admin.tax.regionNotFound"),
      );
    if (region._count.taxRates > 0) {
      throw new BadRequestException(
        i18nMessage("server.admin.tax.regionHasRates"),
      );
    }
    await this.taxPrisma.taxRule.deleteMany({ where: { taxRegionId: id } });
    await this.taxPrisma.taxRegion.delete({ where: { id } });
    await this.audit.createRequiredAuditLog(
      adminId,
      "tax_region_delete",
      "TaxRegion",
      id,
      region,
      null,
    );
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
      orderBy: [{ taxRegionId: "asc" }, { sortOrder: "asc" }, { rate: "asc" }],
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

  /**
   * TR-only platform: bölge yönetimi admin UI'dan kaldırıldı. Oran/kural oluştururken
   * bölge verilmezse varsayılan (yoksa ilk aktif) bölge kullanılır; hiç bölge yoksa
   * "Türkiye" (TR) otomatik yaratılır — taze kurulumda oran eklemek takılmaz.
   */
  private async resolveDefaultTaxRegionId(): Promise<string> {
    const region =
      (await this.taxPrisma.taxRegion.findFirst({
        where: { isActive: true, isDefault: true },
      })) ??
      (await this.taxPrisma.taxRegion.findFirst({
        where: { isActive: true },
        orderBy: { sortOrder: "asc" },
      }));
    if (region) return region.id;
    const created = await this.taxPrisma.taxRegion.create({
      data: {
        name: "Türkiye",
        countryCode: "TR",
        isDefault: true,
        isActive: true,
      },
    });
    return created.id;
  }

  async createTaxRate(
    adminId: string,
    dto: {
      taxRegionId?: string;
      name: string;
      rate: number;
      isDefault?: boolean;
      effectiveFrom?: string;
      effectiveTo?: string;
      sortOrder?: number;
      isActive?: boolean;
    },
  ) {
    if (!this.hasTaxModels)
      throw new BadRequestException(
        "Tax models not available. Run: npx prisma generate (in apps/api)",
      );
    let taxRegionId = dto.taxRegionId;
    if (taxRegionId) {
      const region = await this.taxPrisma.taxRegion.findUnique({
        where: { id: taxRegionId },
      });
      if (!region)
        throw new NotFoundException(
          i18nMessage("server.admin.tax.regionNotFound"),
        );
    } else {
      taxRegionId = await this.resolveDefaultTaxRegionId();
    }
    if (dto.isDefault) {
      await this.taxPrisma.taxRate.updateMany({
        where: { taxRegionId },
        data: { isDefault: false },
      });
    }
    const rate = await this.taxPrisma.taxRate.create({
      data: {
        taxRegionId,
        name: dto.name,
        rate: dto.rate,
        isDefault: dto.isDefault ?? false,
        effectiveFrom: dto.effectiveFrom ? new Date(dto.effectiveFrom) : null,
        effectiveTo: dto.effectiveTo ? new Date(dto.effectiveTo) : null,
        sortOrder: dto.sortOrder ?? 0,
        isActive: dto.isActive ?? true,
      },
    });
    await this.audit.createRequiredAuditLog(
      adminId,
      "tax_rate_create",
      "TaxRate",
      rate.id,
      null,
      rate,
    );
    return rate;
  }

  async updateTaxRate(
    adminId: string,
    id: string,
    dto: {
      name?: string;
      rate?: number;
      isDefault?: boolean;
      effectiveFrom?: string;
      effectiveTo?: string;
      sortOrder?: number;
      isActive?: boolean;
    },
  ) {
    if (!this.hasTaxModels)
      throw new BadRequestException(
        "Tax models not available. Run: npx prisma generate (in apps/api)",
      );
    const existing = await this.taxPrisma.taxRate.findUnique({ where: { id } });
    if (!existing)
      throw new NotFoundException(i18nMessage("server.admin.tax.rateNotFound"));
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
        ...(dto.effectiveFrom !== undefined && {
          effectiveFrom: dto.effectiveFrom ? new Date(dto.effectiveFrom) : null,
        }),
        ...(dto.effectiveTo !== undefined && {
          effectiveTo: dto.effectiveTo ? new Date(dto.effectiveTo) : null,
        }),
        ...(dto.sortOrder != null && { sortOrder: dto.sortOrder }),
        ...(dto.isActive != null && { isActive: dto.isActive }),
      },
    });
    await this.audit.createRequiredAuditLog(
      adminId,
      "tax_rate_update",
      "TaxRate",
      id,
      existing,
      rate,
    );
    return rate;
  }

  async deleteTaxRate(adminId: string, id: string) {
    if (!this.hasTaxModels)
      throw new BadRequestException(
        "Tax models not available. Run: npx prisma generate (in apps/api)",
      );
    const rate = await this.taxPrisma.taxRate.findUnique({
      where: { id },
      include: { _count: { select: { taxRules: true } } },
    });
    if (!rate)
      throw new NotFoundException(i18nMessage("server.admin.tax.rateNotFound"));
    if (rate._count.taxRules > 0) {
      throw new BadRequestException(
        i18nMessage("server.admin.tax.rateHasRules"),
      );
    }
    await this.taxPrisma.taxRate.delete({ where: { id } });
    await this.audit.createRequiredAuditLog(
      adminId,
      "tax_rate_delete",
      "TaxRate",
      id,
      rate,
      null,
    );
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
      orderBy: [
        { taxRegionId: "asc" },
        { priority: "desc" },
        { createdAt: "asc" },
      ],
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

  async createTaxRule(
    adminId: string,
    dto: {
      taxRegionId?: string;
      taxRateId: string;
      scope: string;
      categoryId?: string;
      priority?: number;
      isActive?: boolean;
    },
  ) {
    if (!this.hasTaxModels)
      throw new BadRequestException(
        "Tax models not available. Run: npx prisma generate (in apps/api)",
      );
    const rate = await this.taxPrisma.taxRate.findUnique({
      where: { id: dto.taxRateId },
    });
    if (!rate)
      throw new NotFoundException(i18nMessage("server.admin.tax.rateNotFound"));
    // Bölge verilmezse kuralın bölgesi = oranın bölgesi (TR-only sadeleştirme).
    const taxRegionId = dto.taxRegionId ?? rate.taxRegionId;
    if (rate.taxRegionId !== taxRegionId) {
      throw new BadRequestException(
        i18nMessage("server.admin.tax.rateRegionMismatch"),
      );
    }
    if (dto.scope === "category" && !dto.categoryId) {
      throw new BadRequestException(
        i18nMessage("server.admin.tax.categoryIdRequired"),
      );
    }
    const rule = await this.taxPrisma.taxRule.create({
      data: {
        taxRegionId,
        taxRateId: dto.taxRateId,
        scope: dto.scope as "default_rate" | "category" | "product",
        categoryId: dto.categoryId ?? null,
        priority: dto.priority ?? 0,
        isActive: dto.isActive ?? true,
      },
    });
    await this.audit.createRequiredAuditLog(
      adminId,
      "tax_rule_create",
      "TaxRule",
      rule.id,
      null,
      rule,
    );
    return rule;
  }

  async updateTaxRule(
    adminId: string,
    id: string,
    dto: {
      taxRateId?: string;
      scope?: string;
      categoryId?: string;
      priority?: number;
      isActive?: boolean;
    },
  ) {
    if (!this.hasTaxModels)
      throw new BadRequestException(
        "Tax models not available. Run: npx prisma generate (in apps/api)",
      );
    const existing = await this.taxPrisma.taxRule.findUnique({ where: { id } });
    if (!existing)
      throw new NotFoundException(i18nMessage("server.admin.tax.ruleNotFound"));
    const rate = await this.taxPrisma.taxRule.update({
      where: { id },
      data: {
        ...(dto.taxRateId != null && { taxRateId: dto.taxRateId }),
        ...(dto.scope != null && {
          scope: dto.scope as "default_rate" | "category" | "product",
        }),
        ...(dto.categoryId !== undefined && {
          categoryId: dto.categoryId || null,
        }),
        ...(dto.priority != null && { priority: dto.priority }),
        ...(dto.isActive != null && { isActive: dto.isActive }),
      },
    });
    await this.audit.createRequiredAuditLog(
      adminId,
      "tax_rule_update",
      "TaxRule",
      id,
      existing,
      rate,
    );
    return rate;
  }

  async deleteTaxRule(adminId: string, id: string) {
    if (!this.hasTaxModels)
      throw new BadRequestException(
        "Tax models not available. Run: npx prisma generate (in apps/api)",
      );
    const rule = await this.taxPrisma.taxRule.findUnique({ where: { id } });
    if (!rule)
      throw new NotFoundException(i18nMessage("server.admin.tax.ruleNotFound"));
    await this.taxPrisma.taxRule.delete({ where: { id } });
    await this.audit.createRequiredAuditLog(
      adminId,
      "tax_rule_delete",
      "TaxRule",
      id,
      rule,
      null,
    );
    return { success: true };
  }

  /**
   * Tax reporting: aggregate tax from invoices by period and optionally by region.
   */
  async getTaxReport(query: {
    fromDate?: string;
    toDate?: string;
    groupBy?: "day" | "month" | "year" | "region";
    regionId?: string;
  }) {
    const from = query.fromDate
      ? new Date(query.fromDate)
      : new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
    const to = query.toDate ? new Date(query.toDate) : new Date();
    if (from > to)
      throw new BadRequestException("fromDate must be before toDate");

    const invoices = await this.prisma.invoice.findMany({
      where: {
        issuedAt: { gte: from, lte: to },
        status: { not: "cancelled" },
      },
      select: {
        id: true,
        taxAmount: true,
        total: true,
        subtotal: true,
        issuedAt: true,
        orderId: true,
      },
      orderBy: { issuedAt: "asc" },
    });

    const totalTaxCollected = invoices.reduce(
      (sum, inv) => sum + Number(inv.taxAmount),
      0,
    );
    const totalRevenue = invoices.reduce(
      (sum, inv) => sum + Number(inv.total),
      0,
    );
    const invoiceCount = invoices.length;

    const summary = {
      fromDate: from.toISOString().slice(0, 10),
      toDate: to.toISOString().slice(0, 10),
      totalTaxCollected: Math.round(totalTaxCollected * 100) / 100,
      totalRevenue: Math.round(totalRevenue * 100) / 100,
      invoiceCount,
    };

    let breakdown: Array<{
      period: string;
      taxCollected: number;
      revenue: number;
      count: number;
    }> = [];
    const groupBy = query.groupBy || "month";

    if (groupBy === "day") {
      const byDay = new Map<
        string,
        { tax: number; revenue: number; count: number }
      >();
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
    } else if (groupBy === "month") {
      const byMonth = new Map<
        string,
        { tax: number; revenue: number; count: number }
      >();
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
    } else if (groupBy === "year") {
      const byYear = new Map<
        string,
        { tax: number; revenue: number; count: number }
      >();
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

  // ==================== BASİT KDV CONFIG (tek oran + kategori istisnaları) ====================
  // Admin UI'daki eski Oranlar/Kurallar sekmeleri tek "KDV" görünümüne indirildi.
  // Model (TaxRate/TaxRule) aynen durur; bu uçlar onların üzerinde ince bir cephe.

  /** Varsayılan KDV oranı + kategori istisnaları (default TR bölgesi üzerinden). */
  async getVatConfig() {
    if (!this.hasTaxModels) return { defaultRate: null, overrides: [] };
    const regionId = await this.resolveDefaultTaxRegionId();
    const rules = await this.taxPrisma.taxRule.findMany({
      where: { taxRegionId: regionId, isActive: true },
      include: {
        taxRate: true,
        category: { select: { id: true, name: true } },
      },
      orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
    });
    const def = rules.find((r: any) => r.scope === "default_rate");
    const overrides = rules
      .filter((r: any) => r.scope === "category" && r.categoryId)
      .map((r: any) => ({
        ruleId: r.id,
        categoryId: r.categoryId,
        categoryName: r.category?.name ?? "—",
        rate: Number(r.taxRate.rate),
      }));
    return { defaultRate: def ? Number(def.taxRate.rate) : null, overrides };
  }

  /** Bölgede bu yüzdeye denk aktif TaxRate'i bul, yoksa 'KDV %X' adıyla yarat. */
  private async findOrCreateVatRate(regionId: string, ratePercent: number) {
    const existing = await this.taxPrisma.taxRate.findFirst({
      where: { taxRegionId: regionId, rate: ratePercent, isActive: true },
    });
    if (existing) return existing;
    return this.taxPrisma.taxRate.create({
      data: {
        taxRegionId: regionId,
        name: `KDV %${ratePercent}`,
        rate: ratePercent,
        isActive: true,
      },
    });
  }

  async setDefaultVat(adminId: string, ratePercent: number) {
    if (!this.hasTaxModels)
      throw new BadRequestException(
        "Tax models not available. Run: npx prisma generate (in apps/api)",
      );
    if (!(ratePercent >= 0 && ratePercent <= 100)) {
      throw new BadRequestException(i18nMessage("server.admin.tax.rateRange"));
    }
    const regionId = await this.resolveDefaultTaxRegionId();
    const rate = await this.findOrCreateVatRate(regionId, ratePercent);
    await this.taxPrisma.taxRate.updateMany({
      where: { taxRegionId: regionId },
      data: { isDefault: false },
    });
    await this.taxPrisma.taxRate.update({
      where: { id: rate.id },
      data: { isDefault: true },
    });
    const rule = await this.taxPrisma.taxRule.findFirst({
      where: { taxRegionId: regionId, scope: "default_rate" },
    });
    if (rule) {
      await this.taxPrisma.taxRule.update({
        where: { id: rule.id },
        data: { taxRateId: rate.id, isActive: true },
      });
    } else {
      await this.taxPrisma.taxRule.create({
        data: {
          taxRegionId: regionId,
          taxRateId: rate.id,
          scope: "default_rate",
        },
      });
    }
    await this.audit.createRequiredAuditLog(
      adminId,
      "vat_default_update",
      "TaxRule",
      regionId,
      null,
      { rate: ratePercent },
    );
    return { defaultRate: ratePercent };
  }

  /** Kategori istisnası ekle/güncelle: kategori → KDV %. Kategori başına tek kural (upsert). */
  async setVatOverride(
    adminId: string,
    categoryId: string,
    ratePercent: number,
  ) {
    if (!this.hasTaxModels)
      throw new BadRequestException(
        "Tax models not available. Run: npx prisma generate (in apps/api)",
      );
    if (!(ratePercent >= 0 && ratePercent <= 100)) {
      throw new BadRequestException(i18nMessage("server.admin.tax.rateRange"));
    }
    const category = await this.prisma.category.findUnique({
      where: { id: categoryId },
    });
    if (!category)
      throw new NotFoundException(
        i18nMessage("server.product.categoryNotFound"),
      );
    const regionId = await this.resolveDefaultTaxRegionId();
    const rate = await this.findOrCreateVatRate(regionId, ratePercent);
    const existing = await this.taxPrisma.taxRule.findFirst({
      where: { taxRegionId: regionId, scope: "category", categoryId },
    });
    const rule = existing
      ? await this.taxPrisma.taxRule.update({
          where: { id: existing.id },
          data: { taxRateId: rate.id, isActive: true },
        })
      : await this.taxPrisma.taxRule.create({
          data: {
            taxRegionId: regionId,
            taxRateId: rate.id,
            scope: "category",
            categoryId,
            priority: 10,
          },
        });
    await this.audit.createRequiredAuditLog(
      adminId,
      "vat_override_upsert",
      "TaxRule",
      rule.id,
      existing,
      { categoryId, rate: ratePercent },
    );
    return {
      ruleId: rule.id,
      categoryId,
      categoryName: category.name,
      rate: ratePercent,
    };
  }

  async deleteVatOverride(adminId: string, ruleId: string) {
    if (!this.hasTaxModels)
      throw new BadRequestException(
        "Tax models not available. Run: npx prisma generate (in apps/api)",
      );
    const rule = await this.taxPrisma.taxRule.findUnique({
      where: { id: ruleId },
    });
    if (!rule || rule.scope !== "category")
      throw new NotFoundException(
        i18nMessage("server.admin.tax.exemptionNotFound"),
      );
    await this.taxPrisma.taxRule.delete({ where: { id: ruleId } });
    await this.audit.createRequiredAuditLog(
      adminId,
      "vat_override_delete",
      "TaxRule",
      ruleId,
      rule,
      null,
    );
    return { success: true };
  }

  // ==================== E-TİCARET STOPAJI (GVK 94/19, tevkifat) ====================

  /** E-ticaret stopaj oranı (%). PlatformSetting 'withholding_tax_rate', varsayılan %1 (9284 sayılı CK). */
  async getWithholdingRate(): Promise<{ rate: number }> {
    const row = await this.prisma.platformSetting.findUnique({
      where: { settingKey: "withholding_tax_rate" },
    });
    const rate = Number(row?.settingValue ?? "1");
    return { rate: Number.isFinite(rate) && rate >= 0 ? rate : 1 };
  }

  async setWithholdingRate(
    adminId: string,
    rate: number,
  ): Promise<{ rate: number }> {
    if (!(rate >= 0 && rate <= 100)) {
      throw new BadRequestException(i18nMessage("server.admin.tax.rateRange"));
    }
    await this.prisma.platformSetting.upsert({
      where: { settingKey: "withholding_tax_rate" },
      create: {
        settingKey: "withholding_tax_rate",
        settingValue: String(rate),
        settingType: "number",
        description:
          "E-ticaret stopaj (tevkifat) oranı (%) — GVK 94/19, kurumsal satıcı payout kesintisi",
        updatedBy: adminId,
      },
      update: { settingValue: String(rate), updatedBy: adminId },
    });
    await this.audit.createRequiredAuditLog(
      adminId,
      "withholding_tax_rate_update",
      "PlatformSetting",
      "withholding_tax_rate",
      null,
      { rate },
    );
    return { rate };
  }

  /**
   * Muhtasar dönemi stopaj raporu: ay içinde TAMAMLANAN payout transferlerinden
   * satıcı (VKN) bazında kesilen stopaj. Tevkifat satıcıya ödeme anında doğar →
   * dönem bazı processedAt'tir. Kesilmiş ama henüz ödenmemiş stopaj toplamı
   * (pending/processing/retry_pending) bilgi amaçlı ayrıca döner.
   */
  async getWithholdingReport(query: { year: number; month: number }) {
    const from = new Date(Date.UTC(query.year, query.month - 1, 1));
    const to = new Date(Date.UTC(query.year, query.month, 1));

    const transfers = await this.prisma.payoutTransfer.findMany({
      where: {
        status: "completed",
        processedAt: { gte: from, lt: to },
        withholdingTax: { gt: 0 },
      },
      include: {
        seller: {
          select: {
            id: true,
            displayName: true,
            companyName: true,
            taxId: true,
            email: true,
            deletedAt: true,
          },
        },
      },
      orderBy: { processedAt: "asc" },
    });

    // Silinen satıcının kimliği canlı satırda YOK (anonimleştirme e-postayı
    // `deleted_...@deleted.local`, adı "Silinmiş Kullanıcı" yapıyor, VKN'yi
    // null'lıyor) — bu rapor onu canlı okuduğu için GEÇMİŞ dönemler de geriye
    // dönük bozuluyordu. Kimlik arşivinden çözülür.
    const archived = await this.deletedIdentities.resolveArchivedIdentities(
      transfers.filter((t) => t.seller?.deletedAt).map((t) => t.sellerId),
    );

    const bySeller = new Map<
      string,
      {
        sellerId: string;
        sellerName: string;
        taxId: string | null;
        email: string | null;
        sellerDeleted: boolean;
        identityArchived: boolean | null;
        transferCount: number;
        grossAmount: number;
        withholdingTax: number;
      }
    >();
    for (const t of transfers) {
      const isDeleted = !!t.seller?.deletedAt;
      const archive = isDeleted ? archived.get(t.sellerId) : undefined;
      const cur = bySeller.get(t.sellerId) || {
        sellerId: t.sellerId,
        sellerName: isDeleted
          ? archive?.companyName || archive?.displayName || "—"
          : t.seller?.companyName || t.seller?.displayName || "—",
        // Kurumsalda VKN, bireyselde TCKN bildirilir.
        taxId: isDeleted
          ? (archive?.taxId ?? archive?.nationalId ?? null)
          : (t.seller?.taxId ?? null),
        // Sentinel adres bir devlet bildirimine sızmamalı: arşiv yoksa boş.
        email: isDeleted ? (archive?.email ?? null) : (t.seller?.email ?? null),
        sellerDeleted: isDeleted,
        /** Arşivsiz silinmiş satıcı: sessiz boşluk değil, işaretli eksik. */
        identityArchived: isDeleted ? !!archive : null,
        transferCount: 0,
        grossAmount: 0,
        withholdingTax: 0,
      };
      cur.transferCount += 1;
      cur.grossAmount += Number(t.amount);
      cur.withholdingTax += Number(t.withholdingTax);
      bySeller.set(t.sellerId, cur);
    }
    const rows = Array.from(bySeller.values())
      .map((r) => ({
        ...r,
        grossAmount: Math.round(r.grossAmount * 100) / 100,
        withholdingTax: Math.round(r.withholdingTax * 100) / 100,
      }))
      .sort((a, b) => b.withholdingTax - a.withholdingTax);

    const pendingAgg = await this.prisma.payoutTransfer.aggregate({
      where: {
        status: { in: ["pending", "processing", "retry_pending"] },
        withholdingTax: { gt: 0 },
      },
      _sum: { withholdingTax: true },
      _count: true,
    });

    return {
      period: `${query.year}-${String(query.month).padStart(2, "0")}`,
      summary: {
        totalWithholding:
          Math.round(rows.reduce((s, r) => s + r.withholdingTax, 0) * 100) /
          100,
        sellerCount: rows.length,
        transferCount: transfers.length,
        pendingWithholding:
          Math.round(Number(pendingAgg._sum.withholdingTax ?? 0) * 100) / 100,
        pendingTransferCount: pendingAgg._count,
      },
      rows,
    };
  }

  // ==================== ELOGO FATURA (e-Arşiv/e-Fatura) ====================

  /** Satır kartı: kolonda görünen ad + insan-okur kullanıcı kodu (B010001). */
  private static partyCard(
    user: {
      id: string;
      adminCode: string;
      displayName: string;
      companyName: string | null;
    } | null,
  ) {
    return user
      ? {
          id: user.id,
          code: user.adminCode,
          name: user.companyName || user.displayName,
        }
      : null;
  }

  /**
   * Açıklamaya göre arama. `lineDescription` kesim anında snapshot'lanır ama
   * eski belgelerde boştur; o yüzden metin tiplerin varsayılan açıklamalarıyla
   * da eşleştirilir — "komisyon" araması snapshot'sız belgeleri de bulmalı.
   */
  private invoiceDescriptionWhere(
    search: string,
  ): Prisma.ElogoInvoiceWhereInput {
    const types = invoiceTypesMatchingDescription(search) as ElogoInvoiceType[];
    return {
      OR: [
        { lineDescription: { contains: search, mode: "insensitive" } },
        // Tipe düşüş YALNIZ snapshot'sız belgeler için: snapshot'ı olan bir
        // belgede ekranda yazan metin odur, tipinin varsayılanı değil. Koşulsuz
        // bırakılırsa "komisyon" araması, açıklaması "Kargo bedeli" olarak
        // snapshot'lanmış bir komisyon belgesini de getirirdi.
        ...(types.length > 0
          ? [
              {
                type: { in: types },
                OR: [{ lineDescription: null }, { lineDescription: "" }],
              },
            ]
          : []),
      ],
    };
  }

  /**
   * Kullanıcı koduna (B010001/K010001) ya da id'sine göre arama — kişi belgede
   * satıcı, alıcı veya muhatap olarak geçebilir, üçü de aranır.
   */
  private async invoicePartyWhere(
    code: string,
  ): Promise<Prisma.ElogoInvoiceWhereInput> {
    const user = await this.prisma.user.findFirst({
      where: {
        OR: [
          { adminCode: { equals: code, mode: "insensitive" } },
          { id: code },
        ],
      },
      select: { id: true },
    });
    // Eşleşen kullanıcı yoksa sonuç BOŞ olmalı: filtreyi sessizce düşürmek,
    // aranan kişinin faturaları sanılan dolu bir liste gösterirdi.
    if (!user) return { id: { in: [] } };
    return {
      OR: [
        { sellerUserId: user.id },
        { buyerUserId: user.id },
        { recipientUserId: user.id },
      ],
    };
  }

  /** Toolbar'ın tek arama kutusu — numara, taraf, VKN, ETTN ve tutar birlikte. */
  private invoiceSearchWhere(search: string): Prisma.ElogoInvoiceWhereInput {
    const normalized = search.toLowerCase();
    const numeric = Number(search.replace(",", "."));
    const like = { contains: search, mode: "insensitive" } as const;
    const or: Prisma.ElogoInvoiceWhereInput[] = [
      { invoiceNumber: like },
      { recipientName: like },
      { recipientVknTckn: like },
      { ettn: like },
      { billingReference: like },
      { sourceReference: like },
      // Belgenin muhatabı taraflardan yalnız BİRİdir; karşı tarafın adıyla
      // arama (alıcı komisyonu belgesini satıcının adıyla bulmak) ancak
      // ilişkiler üzerinden mümkün.
      {
        seller: { is: { OR: [{ displayName: like }, { companyName: like }] } },
      },
      { buyer: { is: { OR: [{ displayName: like }, { companyName: like }] } } },
    ];
    if (
      Object.values(ElogoInvoiceType).includes(normalized as ElogoInvoiceType)
    )
      or.push({ type: normalized as ElogoInvoiceType });
    if (
      Object.values(ElogoInvoiceStatus).includes(
        normalized as ElogoInvoiceStatus,
      )
    )
      or.push({ status: normalized as ElogoInvoiceStatus });
    if (Number.isFinite(numeric))
      or.push(
        { netAmount: numeric },
        { taxAmount: numeric },
        { total: numeric },
      );
    return { OR: or };
  }

  /**
   * Tarodan'ın kestiği e-Arşiv/e-Fatura gelir belgeleri (komisyon/hizmet/üyelik/
   * boost/takas/platform satışı) + iade ve ceza belgeleri. Sayfalı, sekmeli
   * (`scope`), filtreli.
   *
   * Satır ETİKET ÜRETMEZ: ham `type`/`status`/`documentType` döner, çeviri
   * admin kataloğunun işidir. Tek istisna `description` — o, belgenin ÜSTÜNDE
   * yazan metnin ta kendisidir, çeviri değil kayıttır.
   */
  async getElogoInvoices(query: ElogoInvoiceQueryDto) {
    const filters: Prisma.ElogoInvoiceWhereInput[] = [
      elogoInvoiceScopeWhere(query.scope, this.prisma.elogoInvoice.fields),
    ];
    if (query.type) filters.push({ type: query.type as ElogoInvoiceType });
    if (query.status)
      filters.push({ status: query.status as ElogoInvoiceStatus });
    if (query.documentType) filters.push({ documentType: query.documentType });
    if (query.context)
      filters.push({ context: query.context as ElogoInvoiceContext });
    if (query.invoiceNumber?.trim())
      filters.push({
        invoiceNumber: {
          contains: query.invoiceNumber.trim(),
          mode: "insensitive",
        },
      });
    if (query.description?.trim())
      filters.push(this.invoiceDescriptionWhere(query.description.trim()));
    if (query.userCode?.trim())
      filters.push(await this.invoicePartyWhere(query.userCode.trim()));
    if (query.startDate || query.endDate) {
      const createdAt: Prisma.DateTimeFilter = {};
      if (query.startDate) createdAt.gte = new Date(query.startDate);
      if (query.endDate) createdAt.lte = new Date(query.endDate);
      filters.push({ createdAt });
    }
    if (query.search?.trim())
      filters.push(this.invoiceSearchWhere(query.search.trim()));
    const where: Prisma.ElogoInvoiceWhereInput = { AND: filters };

    const partySelect = {
      id: true,
      adminCode: true,
      displayName: true,
      companyName: true,
    } satisfies Prisma.UserSelect;
    const select = {
      id: true,
      type: true,
      status: true,
      documentType: true,
      invoiceNumber: true,
      ettn: true,
      sourceReference: true,
      lineDescription: true,
      context: true,
      recipientName: true,
      recipientVknTckn: true,
      recipientUserId: true,
      recipientEmail: true,
      seller: { select: partySelect },
      buyer: { select: partySelect },
      netAmount: true,
      taxAmount: true,
      total: true,
      discountTotal: true,
      vatRate: true,
      billingReference: true,
      pdfUrl: true,
      emailSentAt: true,
      elogoResultMsg: true,
      issuedAt: true,
      cancelledAt: true,
      cancelReason: true,
      createdAt: true,
    } satisfies Prisma.ElogoInvoiceSelect;
    let result;
    if (query.sortBy === "hasPdf") {
      const invoices = await this.prisma.elogoInvoice.findMany({
        where,
        select,
      });
      result = paginateComputedRows(
        invoices,
        (invoice) => (invoice.pdfUrl ? 1 : 0),
        { ...query, sortType: "number" },
      );
    } else {
      const orderBy = resolveOrderBy<
        | Prisma.ElogoInvoiceOrderByWithRelationInput
        | Prisma.ElogoInvoiceOrderByWithRelationInput[]
      >("ElogoInvoice", query, {
        defaultSort: { createdAt: "desc" },
        // Taraf kolonları önce ünvanı, yoksa görünen adı basar; sıralama da
        // aynı sırayı izlemeli, yoksa başlık tıklaması hücreyle uyuşmaz.
        sortMap: {
          sellerName: (direction) => [
            { seller: { companyName: { sort: direction, nulls: "last" } } },
            { seller: { displayName: direction } },
          ],
          buyerName: (direction) => [
            { buyer: { companyName: { sort: direction, nulls: "last" } } },
            { buyer: { displayName: direction } },
          ],
          // Açıklama snapshot'sızsa tipin varsayılan metni gösteriliyor;
          // snapshot boş olanlar tipe göre kendi içinde sıralanır.
          description: (direction) => [
            { lineDescription: { sort: direction, nulls: "last" } },
            { type: direction },
          ],
        },
      });
      result = await paginate(
        this.prisma.elogoInvoice,
        { where, orderBy, select },
        query,
      );
    }
    const rows = result.data as Prisma.ElogoInvoiceGetPayload<{
      select: typeof select;
    }>[];

    return {
      ...result,
      data: rows.map((r) => ({
        id: r.id,
        type: r.type,
        isReturn: r.type === "return_invoice",
        status: r.status,
        documentType: r.documentType,
        invoiceNumber: r.invoiceNumber,
        ettn: r.ettn,
        sourceReference: r.sourceReference,
        description: invoiceDescriptionOf(r.type, r.lineDescription),
        context: r.context,
        seller: AdminTaxService.partyCard(r.seller),
        buyer: AdminTaxService.partyCard(r.buyer),
        recipientName: r.recipientName,
        recipientVknTckn: r.recipientVknTckn,
        recipientUserId: r.recipientUserId,
        recipientEmail: r.recipientEmail,
        netAmount: Number(r.netAmount),
        taxAmount: Number(r.taxAmount),
        total: Number(r.total),
        discountTotal: Number(r.discountTotal),
        vatRate: Number(r.vatRate),
        billingReference: r.billingReference,
        hasPdf: isInvoiceDownloadable(r),
        emailSentAt: r.emailSentAt,
        resultMsg: r.elogoResultMsg,
        issuedAt: r.issuedAt,
        cancelledAt: r.cancelledAt,
        cancelReason: r.cancelReason,
        createdAt: r.createdAt,
      })),
    };
  }

  /**
   * Kurumsal satıcıların siparişe ELLE yüklediği ürün faturaları (eLogo gelir faturasından ayrı).
   * Admin Faturalar sayfasında "Satıcı Faturaları" sekmesi.
   */
  async getSellerUploadedInvoices(query: SellerUploadedInvoiceQueryDto) {
    const where: Prisma.SellerUploadedInvoiceWhereInput = {};
    if (query.startDate || query.endDate) {
      where.uploadedAt = {};
      if (query.startDate) where.uploadedAt.gte = new Date(query.startDate);
      if (query.endDate) where.uploadedAt.lte = new Date(query.endDate);
    }
    if (query.search?.trim()) {
      const q = query.search.trim();
      where.OR = [
        { fileName: { contains: q, mode: "insensitive" } },
        {
          order: { is: { orderNumber: { contains: q, mode: "insensitive" } } },
        },
        {
          order: {
            is: {
              seller: {
                is: { companyName: { contains: q, mode: "insensitive" } },
              },
            },
          },
        },
        {
          order: {
            is: {
              seller: {
                is: { displayName: { contains: q, mode: "insensitive" } },
              },
            },
          },
        },
        {
          order: {
            is: {
              buyer: {
                is: { displayName: { contains: q, mode: "insensitive" } },
              },
            },
          },
        },
      ];
    }

    const orderBy = resolveOrderBy<
      | Prisma.SellerUploadedInvoiceOrderByWithRelationInput
      | Prisma.SellerUploadedInvoiceOrderByWithRelationInput[]
    >("SellerUploadedInvoice", query, {
      defaultSort: { uploadedAt: "desc" },
      // The list shows order + party columns pulled from the linked order.
      sortMap: {
        orderNumber: (direction) => ({ order: { orderNumber: direction } }),
        orderTotal: (direction) => ({ order: { totalAmount: direction } }),
        // The cell displays companyName first and falls back to displayName.
        // Keep null companies last, then use displayName as a stable fallback.
        sellerName: (direction) => [
          {
            order: {
              seller: {
                companyName: { sort: direction, nulls: "last" },
              },
            },
          },
          { order: { seller: { displayName: direction } } },
        ],
        buyerName: (direction) => ({
          order: { buyer: { displayName: direction } },
        }),
      },
    });
    const result = await paginate(
      this.prisma.sellerUploadedInvoice,
      {
        where,
        orderBy,
        select: {
          id: true,
          fileName: true,
          fileSize: true,
          uploadedAt: true,
          replacedAt: true,
          emailSentAt: true,
          order: {
            select: {
              id: true,
              orderNumber: true,
              totalAmount: true,
              seller: {
                select: {
                  id: true,
                  displayName: true,
                  companyName: true,
                  email: true,
                },
              },
              buyer: { select: { id: true, displayName: true, email: true } },
            },
          },
        },
      },
      query,
    );

    return {
      ...result,
      data: result.data.map((r) => ({
        id: r.id,
        fileName: r.fileName,
        fileSize: r.fileSize,
        uploadedAt: r.uploadedAt,
        replacedAt: r.replacedAt,
        emailSentAt: r.emailSentAt,
        orderId: r.order?.id ?? null,
        orderNumber: r.order?.orderNumber ?? null,
        orderTotal: r.order ? Number(r.order.totalAmount) : null,
        sellerId: r.order?.seller?.id ?? null,
        sellerName:
          r.order?.seller?.companyName || r.order?.seller?.displayName || "—",
        sellerEmail: r.order?.seller?.email ?? null,
        buyerId: r.order?.buyer?.id ?? null,
        buyerName: r.order?.buyer?.displayName || "—",
        buyerEmail: r.order?.buyer?.email ?? null,
      })),
    };
  }

  /** Satıcı faturası PDF — admin için presigned indirme URL'i. */
  async getSellerUploadedInvoicePdf(
    id: string,
  ): Promise<{ url: string; fileName: string }> {
    const inv = await this.prisma.sellerUploadedInvoice.findUnique({
      where: { id },
      select: { pdfKey: true, fileName: true },
    });
    if (!inv)
      throw new NotFoundException(i18nMessage("server.invoice.notFound"));
    const url = await this.storageService.getPresignedDownloadUrl(
      "documents",
      inv.pdfKey,
      3600,
    );
    return { url, fileName: inv.fileName };
  }
}
