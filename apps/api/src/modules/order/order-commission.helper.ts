import { Logger } from "@nestjs/common";
import {
  CommissionSellerType,
  MembershipTierType,
  SellerType,
  ShippingPackageTierCode,
} from "@prisma/client";
import type { ShippingBuyerShareByTier } from "../shipping/shipping-tariff.helper";

type CommissionNumericValue = number | string | { toString(): string };

/** Strict kategori/satıcı/fiyat eşleşmesinin ihtiyaç duyduğu ortak alanlar. */
export interface CommissionRuleMatchable {
  id: string;
  ruleSetId: string;
  name: string;
  categoryId: string;
  sellerType: CommissionSellerType;
  minAmount: CommissionNumericValue;
  maxAmount?: CommissionNumericValue | null;
}

/** Satış ve takas fiyatlamasının paylaştığı tek-kural sözleşmesi. */
export interface CommissionRuleForCalculation extends CommissionRuleMatchable {
  buyerCommissionRate: CommissionNumericValue;
  buyerCommissionMin?: CommissionNumericValue | null;
  buyerCommissionMax?: CommissionNumericValue | null;
  buyerServiceFeeRate: CommissionNumericValue;
  buyerServiceFeeMin?: CommissionNumericValue | null;
  buyerServiceFeeMax?: CommissionNumericValue | null;
  sellerCommissionRate: CommissionNumericValue;
  sellerCommissionMin?: CommissionNumericValue | null;
  sellerCommissionMax?: CommissionNumericValue | null;
  sellerPlatformFeeRate: CommissionNumericValue;
  sellerPlatformFeeMin?: CommissionNumericValue | null;
  sellerPlatformFeeMax?: CommissionNumericValue | null;
  shippingBuyerShare: CommissionNumericValue;
  shippingShares?: Array<{
    tierCode: ShippingPackageTierCode;
    buyerShare: CommissionNumericValue;
  }> | null;
}

export type { ShippingBuyerShareByTier };

export interface CommissionCalculationResult {
  buyerFeeAmount: number;
  sellerFeeAmount: number;
  commissionAmount: number;
  buyerCommissionAmount: number;
  buyerServiceFeeAmount: number;
  sellerCommissionAmount: number;
  sellerPlatformFeeAmount: number;
  shippingBuyerShare: number;
  shippingBuyerShares: ShippingBuyerShareByTier;
  ruleSetId: string;
  ruleId: string;
  ruleName: string;
  matchedCategoryId: string;
  matchedSellerType: CommissionSellerType;
  matchedAmount: number;
  /** Geçiş süresince eski tüketiciler için; ikisi de aynı tek kuraldır. */
  sellerRuleId: string;
  buyerRuleId: string;
  appliedRate: number;
  wasMinApplied: boolean;
  wasMaxApplied: boolean;
  effectiveMembershipTier?: MembershipTierType | null;
  /** Vergi motorunun gözlem amaçlı sınıflandırması; eşleşme girdisi değildir. */
  taxpayerType?: string | null;
}

export interface CommissionMatchContext {
  categoryId: string;
  sellerType: CommissionSellerType;
  amount: number;
}

export class CommissionRuleMatchError extends Error {
  constructor(
    readonly matchCount: number,
    readonly context: CommissionMatchContext,
    readonly matchingRuleIds: string[],
  ) {
    super(
      `Expected exactly one commission rule, found ${matchCount} ` +
        `(category=${context.categoryId} sellerType=${context.sellerType} amount=${context.amount})`,
    );
    this.name = "CommissionRuleMatchError";
  }
}

export class CommissionSellerConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CommissionSellerConfigurationError";
  }
}

export class CorporateSellingSuspendedError extends Error {
  constructor() {
    super("Corporate seller has no entitled BUSINESS membership");
    this.name = "CorporateSellingSuspendedError";
  }
}

const numericValue = (value: CommissionNumericValue | null | undefined) =>
  value == null ? null : Number(value);

export const STRICT_COMMISSION_SELLER_TYPES = [
  CommissionSellerType.FREE,
  CommissionSellerType.BASIC,
  CommissionSellerType.PREMIUM,
  CommissionSellerType.BUSINESS,
] as const;

export function validateStrictCommissionCoverage(
  ruleSetId: string,
  categories: Array<{ id: string; name: string }>,
  rules: Array<
    Pick<
      CommissionRuleMatchable,
      "categoryId" | "sellerType" | "minAmount" | "maxAmount"
    >
  >,
) {
  const errors: Array<{
    categoryId: string;
    categoryName: string;
    sellerType: CommissionSellerType;
    message: string;
  }> = [];
  for (const category of categories) {
    for (const sellerType of STRICT_COMMISSION_SELLER_TYPES) {
      const bands = rules
        .filter(
          (rule) =>
            rule.categoryId === category.id && rule.sellerType === sellerType,
        )
        .sort((a, b) => Number(a.minAmount) - Number(b.minAmount));
      const push = (message: string) =>
        errors.push({
          categoryId: category.id,
          categoryName: category.name,
          sellerType,
          message,
        });

      if (bands.length === 0) {
        push("Hiç fiyat aralığı tanımlanmamış.");
        continue;
      }
      if (Number(bands[0].minAmount) !== 0) {
        push("İlk fiyat aralığı 0 TL'den başlamalı.");
      }
      for (let index = 1; index < bands.length; index += 1) {
        const previousMax = bands[index - 1].maxAmount;
        const currentMin = Number(bands[index].minAmount);
        if (previousMax == null) {
          push("Sonsuz üst sınırlı kuraldan sonra başka aralık olamaz.");
          break;
        }
        if (Number(previousMax) !== currentMin) {
          push(
            `${Number(previousMax)} TL ile ${currentMin} TL arasında boşluk var.`,
          );
        }
      }
      if (bands[bands.length - 1].maxAmount != null) {
        push("Son fiyat aralığının üst sınırı boş (sonsuz) olmalı.");
      }
    }
  }
  return {
    valid: errors.length === 0,
    ruleSetId,
    activeCategoryCount: categories.length,
    requiredAxisCount:
      categories.length * STRICT_COMMISSION_SELLER_TYPES.length,
    errors,
  };
}

const DEFAULT_SHIPPING_BUYER_SHARE = 100;
const SHIPPING_TIER_CODES = Object.values(ShippingPackageTierCode);
const clampShare = (share: number) => Math.min(100, Math.max(0, share));

function resolveShippingBuyerShares(
  rule: CommissionRuleForCalculation,
): ShippingBuyerShareByTier {
  const fallback = clampShare(Number(rule.shippingBuyerShare));
  const byTier = new Map(
    (rule.shippingShares ?? []).map((share) => [
      share.tierCode,
      clampShare(Number(share.buyerShare)),
    ]),
  );
  return Object.fromEntries(
    SHIPPING_TIER_CODES.map((code) => [code, byTier.get(code) ?? fallback]),
  ) as ShippingBuyerShareByTier;
}

/** Fiyat aralığı yarı-açıktır: min dahil, max hariç. */
export function amountInCommissionRange(
  rule: Pick<CommissionRuleMatchable, "minAmount" | "maxAmount">,
  amount: number,
): boolean {
  const min = Number(rule.minAmount);
  const max = numericValue(rule.maxAmount);
  return amount >= min && (max == null || amount < max);
}

/** Bareme girecek birim fiyatı para hassasiyetine indirger. */
export function roundCommissionMatchAmount(amount: number): number {
  return Math.round((amount + Number.EPSILON) * 100) / 100;
}

export function findMatchingCommissionRules<T extends CommissionRuleMatchable>(
  rules: T[],
  ctx: CommissionMatchContext,
): T[] {
  return rules.filter(
    (rule) =>
      rule.categoryId === ctx.categoryId &&
      rule.sellerType === ctx.sellerType &&
      amountInCommissionRange(rule, ctx.amount),
  );
}

/** Priority, wildcard ve fallback yoktur; tam olarak bir kural zorunludur. */
export function findMatchingCommissionRule<T extends CommissionRuleMatchable>(
  rules: T[],
  ctx: CommissionMatchContext,
  logger?: Logger,
): T {
  const matches = findMatchingCommissionRules(rules, ctx);
  if (matches.length !== 1) {
    logger?.error(
      `Strict commission match failed count=${matches.length} category=${ctx.categoryId} ` +
        `sellerType=${ctx.sellerType} amount=${ctx.amount} rules=${matches
          .map((rule) => rule.id)
          .join(",")}`,
    );
    throw new CommissionRuleMatchError(
      matches.length,
      ctx,
      matches.map((rule) => rule.id),
    );
  }
  return matches[0];
}

export function clampCommissionAmount(
  raw: number,
  min: number | null,
  max: number | null,
): number {
  let value = raw;
  if (min != null && value < min) value = min;
  if (max != null && value > max) value = max;
  return Math.round(value * 100) / 100;
}

function feeFor(
  amount: number,
  rate: CommissionNumericValue,
  min: CommissionNumericValue | null | undefined,
  max: CommissionNumericValue | null | undefined,
): number {
  const numericRate = Number(rate);
  if (numericRate === 0) return 0;
  return clampCommissionAmount(
    amount * (numericRate / 100),
    numericValue(min),
    numericValue(max),
  );
}

export function calculateCommissionFromRules(
  amount: number,
  rules: CommissionRuleForCalculation[],
  context: Omit<CommissionMatchContext, "amount"> & { amount?: number },
  logger?: Logger,
): CommissionCalculationResult {
  const matchContext: CommissionMatchContext = {
    ...context,
    amount: roundCommissionMatchAmount(context.amount ?? amount),
  };
  const rule = findMatchingCommissionRule(rules, matchContext, logger);

  const buyerCommissionAmount = feeFor(
    amount,
    rule.buyerCommissionRate,
    rule.buyerCommissionMin,
    rule.buyerCommissionMax,
  );
  const buyerServiceFeeAmount = feeFor(
    amount,
    rule.buyerServiceFeeRate,
    rule.buyerServiceFeeMin,
    rule.buyerServiceFeeMax,
  );
  const sellerCommissionAmount = feeFor(
    amount,
    rule.sellerCommissionRate,
    rule.sellerCommissionMin,
    rule.sellerCommissionMax,
  );
  const sellerPlatformFeeAmount = feeFor(
    amount,
    rule.sellerPlatformFeeRate,
    rule.sellerPlatformFeeMin,
    rule.sellerPlatformFeeMax,
  );

  const buyerFeeAmount =
    Math.round((buyerCommissionAmount + buyerServiceFeeAmount) * 100) / 100;
  const sellerFeeAmount =
    Math.round((sellerCommissionAmount + sellerPlatformFeeAmount) * 100) / 100;
  const shippingBuyerShares = resolveShippingBuyerShares(rule);
  const rawPrimarySellerCommission =
    amount * (Number(rule.sellerCommissionRate) / 100);
  const primarySellerMin = numericValue(rule.sellerCommissionMin);
  const primarySellerMax = numericValue(rule.sellerCommissionMax);
  const shippingBuyerShare =
    shippingBuyerShares[SHIPPING_TIER_CODES[0]] ?? DEFAULT_SHIPPING_BUYER_SHARE;

  return {
    buyerFeeAmount,
    sellerFeeAmount,
    commissionAmount:
      Math.round((buyerFeeAmount + sellerFeeAmount) * 100) / 100,
    buyerCommissionAmount,
    buyerServiceFeeAmount,
    sellerCommissionAmount,
    sellerPlatformFeeAmount,
    shippingBuyerShare,
    shippingBuyerShares,
    ruleSetId: rule.ruleSetId,
    ruleId: rule.id,
    ruleName: rule.name,
    matchedCategoryId: matchContext.categoryId,
    matchedSellerType: matchContext.sellerType,
    matchedAmount: matchContext.amount,
    sellerRuleId: rule.id,
    buyerRuleId: rule.id,
    appliedRate: Number(rule.sellerCommissionRate),
    wasMinApplied:
      primarySellerMin != null && rawPrimarySellerCommission < primarySellerMin,
    wasMaxApplied:
      primarySellerMax != null && rawPrimarySellerCommission > primarySellerMax,
  };
}

/**
 * Üyelik ve kurumsallık birlikte tek, geçerli komisyon satıcı tipine çevrilir.
 * Kurumsal hesapların bireysel tier ile veya bireysel hesabın BUSINESS tier ile
 * fiyatlanması sessizce kabul edilmez.
 */
export function resolveCommissionSellerType(input: {
  userSellerType: SellerType | null;
  membershipTier: MembershipTierType;
  configuredMembershipTier?: MembershipTierType | null;
  businessStatus?: string | null;
  companyName?: string | null;
  taxId?: string | null;
}): CommissionSellerType {
  const isPlatform = input.userSellerType === SellerType.platform;
  const isCorporate =
    input.businessStatus === "approved" &&
    !!input.companyName?.trim() &&
    !!input.taxId?.trim();

  if (isPlatform) return CommissionSellerType.BUSINESS;

  if (input.configuredMembershipTier === MembershipTierType.business) {
    if (!isCorporate) {
      throw new CommissionSellerConfigurationError(
        "BUSINESS membership requires an approved corporate seller identity",
      );
    }
    if (input.membershipTier !== MembershipTierType.business) {
      throw new CorporateSellingSuspendedError();
    }
  }

  if (
    isCorporate &&
    input.configuredMembershipTier !== MembershipTierType.business
  ) {
    throw new CommissionSellerConfigurationError(
      "Approved corporate seller must be configured with BUSINESS membership",
    );
  }

  if (input.membershipTier === MembershipTierType.business) {
    if (!isCorporate) {
      throw new CommissionSellerConfigurationError(
        "BUSINESS commission tier requires an approved corporate seller",
      );
    }
    return CommissionSellerType.BUSINESS;
  }

  if (isCorporate) {
    throw new CorporateSellingSuspendedError();
  }

  if (input.membershipTier === MembershipTierType.basic) {
    return CommissionSellerType.BASIC;
  }
  if (input.membershipTier === MembershipTierType.premium) {
    return CommissionSellerType.PREMIUM;
  }
  return CommissionSellerType.FREE;
}
