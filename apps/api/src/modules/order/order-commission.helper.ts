import { Logger } from "@nestjs/common";
import {
  CommissionAppliesTo,
  CommissionRuleType,
  CommissionSellerType,
  MembershipTierType,
  SellerType,
} from "@prisma/client";

type CommissionNumericValue = number | string | { toString(): string };

export interface CommissionRuleForCalculation {
  id: string;
  name: string;
  ruleType?: CommissionRuleType;
  categoryId: string | null;
  sellerType: CommissionSellerType | null;
  appliesTo: CommissionAppliesTo;
  sellerRate?: CommissionNumericValue | null;
  buyerRate?: CommissionNumericValue | null;
  sellerMin?: CommissionNumericValue | null;
  sellerMax?: CommissionNumericValue | null;
  buyerMin?: CommissionNumericValue | null;
  buyerMax?: CommissionNumericValue | null;
}

export interface CommissionCalculationResult {
  buyerFeeAmount: number;
  sellerFeeAmount: number;
  commissionAmount: number;
  ruleId: string | null;
  ruleName: string | null;
  ruleType?: CommissionRuleType;
  appliedRate?: number;
  wasMinApplied?: boolean;
  wasMaxApplied?: boolean;
}

/**
 * Saf komisyon kuralı eşleştirme/hesap yardımcıları — OrderService.calculateCommission
 * bunları kullanır. DB erişimi yok; unit testte doğrudan çağrılabilir.
 */

/**
 * Find matching commission rule by specificity
 * Order: 1) cat+type, 2) cat+ALL (kategori öncelikli), 3) type-only, 4) ALL+NULL
 * Each level can only have one rule (validated in admin service)
 */
export function findMatchingCommissionRule<
  T extends Pick<CommissionRuleForCalculation, "categoryId" | "sellerType">,
>(
  rules: T[],
  categoryId: string | null | undefined,
  sellerType: CommissionSellerType,
  logger?: Logger,
): T | null {
  // 1. categoryId + sellerType (most specific)
  if (categoryId) {
    const exact = rules.find(
      (r) => r.categoryId === categoryId && r.sellerType === sellerType,
    );
    if (exact) {
      logger?.debug(
        `Matched exact rule: category=${categoryId}, sellerType=${sellerType}`,
      );
      return exact;
    }
  }

  // 2. categoryId + ALL (category priority - more specific than seller type)
  // NOT: sellerType null = "tüm satıcı tipleri" (ALL ile eşdeğer). Alıcı hizmet bedeli
  // kuralları sellerType'sız oluşturulur; null'ı ALL gibi ele almazsak hiç eşleşmez.
  if (categoryId) {
    const catAll = rules.find(
      (r) =>
        r.categoryId === categoryId &&
        (r.sellerType === CommissionSellerType.ALL || r.sellerType == null),
    );
    if (catAll) {
      logger?.debug(
        `Matched category rule: category=${categoryId}, sellerType=ALL`,
      );
      return catAll;
    }
  }

  // 3. categoryId IS NULL + sellerType
  const typeOnly = rules.find(
    (r) => r.categoryId === null && r.sellerType === sellerType,
  );
  if (typeOnly) {
    logger?.debug(`Matched seller type rule: sellerType=${sellerType}`);
    return typeOnly;
  }

  // 4. categoryId IS NULL + ALL (default) — sellerType null da ALL sayılır (alıcı hizmet bedeli)
  const defaultRule = rules.find(
    (r) =>
      r.categoryId === null &&
      (r.sellerType === CommissionSellerType.ALL || r.sellerType == null),
  );

  if (defaultRule) {
    logger?.debug("Using default commission rule (ALL+NULL)");
    return defaultRule;
  }

  return null;
}

/**
 * Clamp amount between min and max
 */
export function clampCommissionAmount(
  raw: number,
  min: number | null,
  max: number | null,
): number {
  let val = raw;
  if (min != null && val < min) val = min;
  if (max != null && val > max) val = max;
  return Math.round(val * 100) / 100;
}

const numericValue = (value: CommissionNumericValue | null | undefined) =>
  value == null ? null : Number(value);

/**
 * Calculate both commission sides using the same independent matching used at
 * checkout. Keeping this pure lets admin previews quote unsaved draft rules
 * without duplicating the precedence or fee math.
 */
export function calculateCommissionFromRules(
  amount: number,
  rules: CommissionRuleForCalculation[],
  categoryId: string | null | undefined,
  sellerType: CommissionSellerType,
  logger?: Logger,
): CommissionCalculationResult {
  const sellerMatch = findMatchingCommissionRule(
    rules.filter(
      (rule) =>
        rule.appliesTo === CommissionAppliesTo.SELLER ||
        rule.appliesTo === CommissionAppliesTo.BOTH,
    ),
    categoryId,
    sellerType,
    logger,
  );
  const buyerMatch = findMatchingCommissionRule(
    rules.filter(
      (rule) =>
        rule.appliesTo === CommissionAppliesTo.BUYER ||
        rule.appliesTo === CommissionAppliesTo.BOTH,
    ),
    categoryId,
    sellerType,
    logger,
  );

  if (!sellerMatch && !buyerMatch) {
    return {
      buyerFeeAmount: 0,
      sellerFeeAmount: 0,
      commissionAmount: 0,
      ruleId: null,
      ruleName: null,
    };
  }

  const sellerRate = numericValue(sellerMatch?.sellerRate);
  const buyerRate = numericValue(buyerMatch?.buyerRate);
  const sellerFee =
    sellerRate == null
      ? 0
      : clampCommissionAmount(
          amount * (sellerRate / 100),
          numericValue(sellerMatch?.sellerMin),
          numericValue(sellerMatch?.sellerMax),
        );
  const buyerFee =
    buyerRate == null
      ? 0
      : clampCommissionAmount(
          amount * (buyerRate / 100),
          numericValue(buyerMatch?.buyerMin),
          numericValue(buyerMatch?.buyerMax),
        );
  const primary = sellerMatch ?? buyerMatch;

  return {
    buyerFeeAmount: buyerFee,
    sellerFeeAmount: sellerFee,
    commissionAmount: sellerFee + buyerFee,
    ruleId: primary?.id ?? null,
    ruleName: primary?.name ?? null,
    ruleType: primary?.ruleType,
    appliedRate: sellerRate ?? buyerRate ?? 0,
  };
}

/**
 * Map seller attributes to the commission rule buckets.
 * Paid membership takes precedence over the account-level seller type:
 * - business membership -> BUSINESS
 * - premium membership -> PREMIUM
 * - platform seller without a paid membership -> BUSINESS
 * - free/basic membership or individual/verified seller -> FREE
 */
export function mapSellerTypeForCommission(
  userSellerType: SellerType | null,
  membershipTier: MembershipTierType | null,
): CommissionSellerType {
  if (membershipTier === MembershipTierType.business) {
    return CommissionSellerType.BUSINESS;
  }

  if (membershipTier === MembershipTierType.premium) {
    return CommissionSellerType.PREMIUM;
  }

  // Platform sellers -> BUSINESS
  if (userSellerType === SellerType.platform) {
    return CommissionSellerType.BUSINESS;
  }

  // Individual/Verified -> FREE
  return CommissionSellerType.FREE;
}
