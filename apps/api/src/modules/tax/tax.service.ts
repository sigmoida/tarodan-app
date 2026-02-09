/**
 * Tax resolution for website/checkout/invoice.
 * Resolves applicable tax rate from admin-configured TaxRegion, TaxRate, TaxRule.
 */
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma';

export interface ResolvedTax {
  taxRateId: string;
  rate: number;
  name: string;
}

@Injectable()
export class TaxService {
  constructor(private readonly prisma: PrismaService) {}

  private get taxPrisma(): any {
    return this.prisma as any;
  }

  private get hasTaxModels(): boolean {
    return !!(this.taxPrisma.taxRegion && this.taxPrisma.taxRate && this.taxPrisma.taxRule);
  }

  /**
   * Resolve applicable tax rate for a given location and optional category.
   * Used by invoice generation and (optionally) checkout preview.
   * @param countryCode ISO 3166-1 alpha-2 (e.g. TR). Defaults to TR if not provided.
   * @param regionCode Optional region/state code (e.g. 34 for Istanbul).
   * @param categoryId Optional product category ID for category-specific rules.
   * @returns Resolved rate or null if no rules / models not available.
   */
  async resolveTaxRate(
    countryCode: string = 'TR',
    regionCode?: string | null,
    categoryId?: string | null,
  ): Promise<ResolvedTax | null> {
    if (!this.hasTaxModels) return null;

    const code = (countryCode || 'TR').toUpperCase();

    // 1) Find tax region: exact match (country + region), then default, then first active
    let region = await this.taxPrisma.taxRegion.findFirst({
      where: {
        isActive: true,
        countryCode: code,
        ...(regionCode != null && regionCode !== '' ? { regionCode } : { OR: [{ regionCode: null }, { regionCode: '' }] }),
      },
    });
    if (!region && regionCode != null && regionCode !== '') {
      region = await this.taxPrisma.taxRegion.findFirst({
        where: { isActive: true, countryCode: code },
      });
    }
    if (!region) {
      region = await this.taxPrisma.taxRegion.findFirst({
        where: { isActive: true, isDefault: true },
      });
    }
    if (!region) {
      region = await this.taxPrisma.taxRegion.findFirst({
        where: { isActive: true },
        orderBy: { sortOrder: 'asc' },
      });
    }
    if (!region) return null;

    // 2) Find applicable rule: category-specific first (by priority), then default_rate
    const rules = await this.taxPrisma.taxRule.findMany({
      where: {
        taxRegionId: region.id,
        isActive: true,
        OR: [
          { scope: 'default_rate' },
          ...(categoryId ? [{ scope: 'category', categoryId }] : []),
        ],
      },
      include: {
        taxRate: true,
      },
      orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
    });

    // Prefer category rule if we have a matching one, else default_rate
    const rule = rules.find((r: any) => r.scope === 'category' && r.categoryId === categoryId)
      || rules.find((r: any) => r.scope === 'default_rate');
    if (!rule || !rule.taxRate?.isActive) return null;

    const rate = rule.taxRate;
    return {
      taxRateId: rate.id,
      rate: Number(rate.rate),
      name: rate.name || `%${rate.rate}`,
    };
  }

  /**
   * Calculate tax amount from a subtotal and resolved rate.
   */
  calculateTaxAmount(subtotal: number, resolved: ResolvedTax | null): number {
    if (!resolved || resolved.rate <= 0) return 0;
    return Math.round((subtotal * resolved.rate / 100) * 100) / 100;
  }
}
