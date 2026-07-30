import { Logger } from "@nestjs/common";
import {
  CommissionAppliesTo,
  CommissionRuleType,
  CommissionSellerType,
  CommissionTaxpayerType,
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
  /** v2 axis: individual/corporate (null → treated as `all`). */
  taxpayerType?: CommissionTaxpayerType | null;
  /** v2 tiered matching: product/line amount range [minAmount, maxAmount] (null = unbounded). */
  minAmount?: CommissionNumericValue | null;
  maxAmount?: CommissionNumericValue | null;
  // ── legacy single rates (kept; back-filled into the v2 rates by migration) ──
  sellerRate?: CommissionNumericValue | null;
  buyerRate?: CommissionNumericValue | null;
  sellerMin?: CommissionNumericValue | null;
  sellerMax?: CommissionNumericValue | null;
  buyerMin?: CommissionNumericValue | null;
  buyerMax?: CommissionNumericValue | null;
  // ── v2 four explicit rates + TL floor/cap ──
  buyerCommissionRate?: CommissionNumericValue | null;
  buyerCommissionMin?: CommissionNumericValue | null;
  buyerCommissionMax?: CommissionNumericValue | null;
  buyerServiceFeeRate?: CommissionNumericValue | null;
  buyerServiceFeeMin?: CommissionNumericValue | null;
  buyerServiceFeeMax?: CommissionNumericValue | null;
  sellerCommissionRate?: CommissionNumericValue | null;
  sellerCommissionMin?: CommissionNumericValue | null;
  sellerCommissionMax?: CommissionNumericValue | null;
  sellerPlatformFeeRate?: CommissionNumericValue | null;
  sellerPlatformFeeMin?: CommissionNumericValue | null;
  sellerPlatformFeeMax?: CommissionNumericValue | null;
  /** Buyer share (%) of the single shipping cost; seller share = 100 - this. */
  shippingBuyerShare?: CommissionNumericValue | null;
}

export interface CommissionCalculationResult {
  /** buyerCommission + buyerServiceFee (what the buyer pays on top). */
  buyerFeeAmount: number;
  /** sellerCommission + sellerPlatformFee (deducted from the seller payout). */
  sellerFeeAmount: number;
  /** buyerFeeAmount + sellerFeeAmount. */
  commissionAmount: number;
  // v2 breakdown
  buyerCommissionAmount: number;
  buyerServiceFeeAmount: number;
  sellerCommissionAmount: number;
  sellerPlatformFeeAmount: number;
  /** 0–100; buyer's share of the shipping cost (default 100 = buyer pays all). */
  shippingBuyerShare: number;
  ruleId: string | null;
  ruleName: string | null;
  /**
   * Hangi tarafın kuralı eşleşti? `ruleId` bunların birleşimidir (seller ?? buyer),
   * bu yüzden tek başına "satıcı komisyonu yapılandırılmış mı" sorusunu YANITLAMAZ.
   * Fail-closed guard'lar bu alanlara bakmalıdır.
   */
  sellerRuleId: string | null;
  buyerRuleId: string | null;
  ruleType?: CommissionRuleType;
  appliedRate?: number;
  wasMinApplied?: boolean;
  wasMaxApplied?: boolean;
  /** Effective paid tier used while selecting the commission rule. */
  effectiveMembershipTier?: MembershipTierType | null;
  /** Taxpayer classification used while selecting commission/tax policy. */
  taxpayerType?: CommissionTaxpayerType;
}

export interface CommissionMatchContext {
  categoryId?: string | null;
  sellerType: CommissionSellerType;
  /** Buyer/corporate axis; defaults to `all` when unknown. */
  taxpayerType?: CommissionTaxpayerType;
  /** Product/line amount for tiered [min,max] gating; omit to skip the gate. */
  amount?: number;
}

const numericValue = (value: CommissionNumericValue | null | undefined) =>
  value == null ? null : Number(value);

/**
 * "Catch-all" kural: her eksende wildcard, tutar aralığı sınırsız ve HER İKİ
 * tarafa (BOTH) uygulanan kural. En az bir aktif catch-all kuralın varlığı
 * dağıtım önkoşuludur: aksi halde eşleşmeyen her kategori/tutar checkout'ta
 * fail-closed 503 verir (veya yalnız alıcı tarafı eşleşir ve satıcı komisyonu
 * sessizce 0 olur). Tanım tek kaynaktan gelir — health check ve silme guard'ı
 * bu fonksiyonu kullanır.
 */
export function isCatchAllCommissionRule(
  rule: Pick<
    CommissionRuleForCalculation,
    | "categoryId"
    | "sellerType"
    | "taxpayerType"
    | "minAmount"
    | "maxAmount"
    | "appliesTo"
  >,
): boolean {
  const wildcardSeller =
    rule.sellerType == null || rule.sellerType === CommissionSellerType.ALL;
  const wildcardTaxpayer =
    rule.taxpayerType == null ||
    rule.taxpayerType === CommissionTaxpayerType.all;
  return (
    rule.categoryId == null &&
    wildcardSeller &&
    wildcardTaxpayer &&
    rule.minAmount == null &&
    rule.maxAmount == null &&
    rule.appliesTo === CommissionAppliesTo.BOTH
  );
}

/** Whether `amount` falls in the rule's [minAmount, maxAmount] range (null = unbounded). */
function amountInRange(
  rule: Pick<CommissionRuleForCalculation, "minAmount" | "maxAmount">,
  amount: number | undefined,
): boolean {
  if (amount == null) return true; // no amount context → don't gate
  const min = numericValue(rule.minAmount);
  const max = numericValue(rule.maxAmount);
  if (min != null && amount < min) return false;
  if (max != null && amount > max) return false;
  return true;
}

/**
 * Find the best-matching commission rule by specificity score, gated by the
 * amount range. Axes (most→least specific): category (4) > taxpayerType (2) >
 * sellerType (1); `null`/`all`/`ALL` act as wildcards. Ties break by higher
 * `priority`. This generalizes the old category→sellerType precedence: with
 * taxpayerType defaulting to `all` and no amount bounds it reduces to the
 * previous behavior.
 */
export function findMatchingCommissionRule<
  T extends Pick<
    CommissionRuleForCalculation,
    "categoryId" | "sellerType" | "taxpayerType" | "minAmount" | "maxAmount"
  > & { priority?: number },
>(rules: T[], ctx: CommissionMatchContext, logger?: Logger): T | null {
  const taxpayer = ctx.taxpayerType ?? CommissionTaxpayerType.all;

  const candidates = rules
    .filter((r) => {
      // category: specific must equal; null = wildcard
      if (r.categoryId != null && r.categoryId !== ctx.categoryId) return false;
      // sellerType: specific must equal; null/ALL = wildcard
      if (
        r.sellerType != null &&
        r.sellerType !== CommissionSellerType.ALL &&
        r.sellerType !== ctx.sellerType
      )
        return false;
      // taxpayerType: specific must equal; null/all = wildcard
      if (
        r.taxpayerType != null &&
        r.taxpayerType !== CommissionTaxpayerType.all &&
        r.taxpayerType !== taxpayer
      )
        return false;
      return amountInRange(r, ctx.amount);
    })
    .map((r) => {
      let score = 0;
      if (r.categoryId != null && r.categoryId === ctx.categoryId) score += 4;
      if (
        r.taxpayerType != null &&
        r.taxpayerType !== CommissionTaxpayerType.all
      )
        score += 2;
      if (r.sellerType != null && r.sellerType !== CommissionSellerType.ALL)
        score += 1;
      // Prefer bounded ranges over unbounded when both match (tighter tier wins).
      if (r.minAmount != null || r.maxAmount != null) score += 0.5;
      return { rule: r, score };
    })
    .sort(
      (a, b) =>
        b.score - a.score || (b.rule.priority ?? 0) - (a.rule.priority ?? 0),
    );

  const best = candidates[0]?.rule ?? null;
  if (best) {
    logger?.debug(
      `Matched commission rule score=${candidates[0].score} category=${ctx.categoryId} sellerType=${ctx.sellerType} taxpayer=${taxpayer}`,
    );
  }
  return best;
}

/** Clamp amount between min and max (TL floor/cap), rounded to 2 decimals. */
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

/** rate% of amount, clamped by [min,max]; 0 when the rate is absent. */
function feeFor(
  amount: number,
  rate: CommissionNumericValue | null | undefined,
  min: CommissionNumericValue | null | undefined,
  max: CommissionNumericValue | null | undefined,
): number {
  const r = numericValue(rate);
  if (r == null || r === 0) return 0;
  return clampCommissionAmount(
    amount * (r / 100),
    numericValue(min),
    numericValue(max),
  );
}

/**
 * Compute the full deduction breakdown for an order line from the matched rules.
 *
 * Buyer side (appliesTo ∈ {BUYER, BOTH}) supplies buyerCommission + buyerServiceFee;
 * seller side (appliesTo ∈ {SELLER, BOTH}) supplies sellerCommission + sellerPlatformFee.
 * A v2 rule with appliesTo=BOTH provides all four; legacy split rules still work
 * (buyerServiceFee/sellerCommission were back-filled from the old buyer/seller rates).
 * Shipping split (`shippingBuyerShare`) comes from the seller-side rule, else buyer-side.
 */
export function calculateCommissionFromRules(
  amount: number,
  rules: CommissionRuleForCalculation[],
  ctxOrCategoryId:
    CommissionMatchContext | (string | null | undefined) = undefined,
  legacySellerType?: CommissionSellerType,
  logger?: Logger,
): CommissionCalculationResult {
  // Back-compat overload: (amount, rules, categoryId, sellerType, logger)
  const ctx: CommissionMatchContext =
    ctxOrCategoryId != null && typeof ctxOrCategoryId === "object"
      ? ctxOrCategoryId
      : {
          categoryId: ctxOrCategoryId as string | null | undefined,
          sellerType: legacySellerType ?? CommissionSellerType.ALL,
          amount,
        };
  const matchCtx: CommissionMatchContext = { amount, ...ctx };

  const sellerMatch = findMatchingCommissionRule(
    rules.filter(
      (r) =>
        r.appliesTo === CommissionAppliesTo.SELLER ||
        r.appliesTo === CommissionAppliesTo.BOTH,
    ),
    matchCtx,
    logger,
  );
  const buyerMatch = findMatchingCommissionRule(
    rules.filter(
      (r) =>
        r.appliesTo === CommissionAppliesTo.BUYER ||
        r.appliesTo === CommissionAppliesTo.BOTH,
    ),
    matchCtx,
    logger,
  );

  const sellerCommissionAmount = sellerMatch
    ? feeFor(
        amount,
        // v2 rate if set, else legacy sellerRate
        sellerMatch.sellerCommissionRate ?? sellerMatch.sellerRate,
        sellerMatch.sellerCommissionMin ?? sellerMatch.sellerMin,
        sellerMatch.sellerCommissionMax ?? sellerMatch.sellerMax,
      )
    : 0;
  const sellerPlatformFeeAmount = sellerMatch
    ? feeFor(
        amount,
        sellerMatch.sellerPlatformFeeRate,
        sellerMatch.sellerPlatformFeeMin,
        sellerMatch.sellerPlatformFeeMax,
      )
    : 0;
  const buyerServiceFeeAmount = buyerMatch
    ? feeFor(
        amount,
        buyerMatch.buyerServiceFeeRate ?? buyerMatch.buyerRate,
        buyerMatch.buyerServiceFeeMin ?? buyerMatch.buyerMin,
        buyerMatch.buyerServiceFeeMax ?? buyerMatch.buyerMax,
      )
    : 0;
  const buyerCommissionAmount = buyerMatch
    ? feeFor(
        amount,
        buyerMatch.buyerCommissionRate,
        buyerMatch.buyerCommissionMin,
        buyerMatch.buyerCommissionMax,
      )
    : 0;

  const buyerFeeAmount =
    Math.round((buyerCommissionAmount + buyerServiceFeeAmount) * 100) / 100;
  const sellerFeeAmount =
    Math.round((sellerCommissionAmount + sellerPlatformFeeAmount) * 100) / 100;
  const primary = sellerMatch ?? buyerMatch;
  const shareRaw = numericValue(
    sellerMatch?.shippingBuyerShare ?? buyerMatch?.shippingBuyerShare,
  );
  const shippingBuyerShare =
    shareRaw == null ? 100 : Math.min(100, Math.max(0, shareRaw));

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
    ruleId: primary?.id ?? null,
    ruleName: primary?.name ?? null,
    sellerRuleId: sellerMatch?.id ?? null,
    buyerRuleId: buyerMatch?.id ?? null,
    ruleType: primary?.ruleType,
    appliedRate:
      numericValue(
        sellerMatch?.sellerCommissionRate ?? sellerMatch?.sellerRate,
      ) ??
      numericValue(buyerMatch?.buyerServiceFeeRate ?? buyerMatch?.buyerRate) ??
      0,
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

/**
 * Corporate (kurumsal) taxpayer test — the SAME rule used for VAT/withholding
 * eligibility (businessStatus approved + a tax id present). Drives the
 * `taxpayerType` matching axis.
 */
export function resolveTaxpayerType(seller: {
  businessStatus?: string | null;
  taxId?: string | null;
}): CommissionTaxpayerType {
  return seller?.businessStatus === "approved" && seller?.taxId
    ? CommissionTaxpayerType.corporate
    : CommissionTaxpayerType.individual;
}
