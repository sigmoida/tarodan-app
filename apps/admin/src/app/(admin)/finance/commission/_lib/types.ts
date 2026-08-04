import { z } from "zod";
import type { useTranslations } from "next-intl";

type T = ReturnType<typeof useTranslations<never>>;

export interface Category {
  id: string;
  name: string;
}

export type SellerType = "FREE" | "BASIC" | "PREMIUM" | "BUSINESS";
export type RuleSetStatus = "DRAFT" | "ACTIVE" | "ARCHIVED";
export const PACKAGE_TIER_CODES = ["small", "medium", "large"] as const;
export type PackageTierCode = (typeof PACKAGE_TIER_CODES)[number];

export interface CommissionRuleSet {
  id: string;
  name: string;
  version: number;
  status: RuleSetStatus;
  publishedAt?: string | null;
  _count?: { rules: number };
}

export interface CommissionRule {
  id: string;
  ruleSetId: string;
  name: string;
  categoryId: string;
  categoryName: string;
  sellerType: SellerType;
  minAmount: number;
  maxAmount: number | null;
  buyerCommissionRate: number;
  buyerCommissionMin: number | null;
  buyerCommissionMax: number | null;
  buyerServiceFeeRate: number;
  buyerServiceFeeMin: number | null;
  buyerServiceFeeMax: number | null;
  sellerCommissionRate: number;
  sellerCommissionMin: number | null;
  sellerCommissionMax: number | null;
  sellerPlatformFeeRate: number;
  sellerPlatformFeeMin: number | null;
  sellerPlatformFeeMax: number | null;
  tradeFeeSellerAmount: number;
  tradeFeeBuyerAmount: number;
  shippingBuyerShare: number;
  shippingShares: Array<{
    tierCode: PackageTierCode;
    buyerShare: number | string;
  }>;
  ruleSet?: CommissionRuleSet;
  createdAt: string;
  updatedAt: string;
}

export interface CommissionCoverageValidation {
  valid: boolean;
  ruleSetId: string;
  activeCategoryCount: number;
  requiredAxisCount: number;
  errors: Array<{
    categoryId: string;
    categoryName: string;
    sellerType: SellerType;
    message: string;
  }>;
}

export interface CommissionRevenue {
  totalCommission: number;
  totalBuyerFee: number;
  totalSellerFee: number;
  totalSubtotal: number;
  totalTax: number;
  totalShipping: number;
  byMonth: Array<{ period: string; commission: number; orderCount: number }>;
}

export const sellerTypes = (t: T): { value: SellerType; label: string }[] => [
  { value: "FREE", label: t("admin.finance.commission.sellerTypes.free") },
  { value: "BASIC", label: t("admin.finance.commission.sellerTypes.basic") },
  {
    value: "PREMIUM",
    label: t("admin.finance.commission.sellerTypes.premium"),
  },
  {
    value: "BUSINESS",
    label: t("admin.finance.commission.sellerTypes.business"),
  },
];

export const sellerTypeLabel = (value: SellerType, t: T) =>
  sellerTypes(t).find((item) => item.value === value)?.label ?? value;

const numberString = z
  .string()
  .min(1)
  .refine((value) => Number.isFinite(Number(value)) && Number(value) >= 0);
const optionalNumberString = z.string().optional().default("");
const shareField = z.string().optional().default("");

export const commissionSchema = (t: T) =>
  z
    .object({
      name: z
        .string()
        .min(1, t("admin.finance.commission.validation.nameRequired")),
      categoryId: z.string().min(1, "Kategori zorunludur"),
      sellerType: z.enum(["FREE", "BASIC", "PREMIUM", "BUSINESS"]),
      minAmount: numberString,
      maxAmount: optionalNumberString,
      buyerCommissionRate: numberString,
      buyerCommissionMin: optionalNumberString,
      buyerCommissionMax: optionalNumberString,
      buyerServiceFeeRate: numberString,
      buyerServiceFeeMin: optionalNumberString,
      buyerServiceFeeMax: optionalNumberString,
      sellerCommissionRate: numberString,
      sellerCommissionMin: optionalNumberString,
      sellerCommissionMax: optionalNumberString,
      sellerPlatformFeeRate: numberString,
      sellerPlatformFeeMin: optionalNumberString,
      sellerPlatformFeeMax: optionalNumberString,
      tradeFeeSellerAmount: numberString,
      tradeFeeBuyerAmount: numberString,
      shippingBuyerShare: numberString,
      shippingShareSmall: shareField,
      shippingShareMedium: shareField,
      shippingShareLarge: shareField,
    })
    .superRefine((value, context) => {
      if (
        value.maxAmount &&
        Number(value.maxAmount) <= Number(value.minAmount)
      ) {
        context.addIssue({
          code: "custom",
          path: ["maxAmount"],
          message: t("admin.finance.commission.validation.strictRange"),
        });
      }
      const rateKeys = [
        "buyerCommissionRate",
        "buyerServiceFeeRate",
        "sellerCommissionRate",
        "sellerPlatformFeeRate",
      ] as const;
      for (const key of rateKeys) {
        if (Number(value[key]) > 100) {
          context.addIssue({
            code: "custom",
            path: [key],
            message: t("admin.finance.commission.validation.rateRange"),
          });
        }
      }
      const pairs = [
        ["buyerCommissionRate", "buyerCommissionMin", "buyerCommissionMax"],
        ["buyerServiceFeeRate", "buyerServiceFeeMin", "buyerServiceFeeMax"],
        ["sellerCommissionRate", "sellerCommissionMin", "sellerCommissionMax"],
        [
          "sellerPlatformFeeRate",
          "sellerPlatformFeeMin",
          "sellerPlatformFeeMax",
        ],
      ] as const;
      for (const [rateKey, minKey, maxKey] of pairs) {
        if (
          Number(value[rateKey]) === 0 &&
          (Number(value[minKey] || 0) > 0 || Number(value[maxKey] || 0) > 0)
        ) {
          context.addIssue({
            code: "custom",
            path: [rateKey],
            message: t("admin.finance.commission.validation.zeroRateBounds"),
          });
        }
        if (
          value[minKey] &&
          value[maxKey] &&
          Number(value[maxKey]) < Number(value[minKey])
        ) {
          context.addIssue({
            code: "custom",
            path: [maxKey],
            message: t("admin.finance.commission.validation.maxBelowMin"),
          });
        }
      }
    });

export type CommissionFormValues = z.infer<ReturnType<typeof commissionSchema>>;

export const emptyCommissionForm: CommissionFormValues = {
  name: "",
  categoryId: "",
  sellerType: "FREE",
  minAmount: "0",
  maxAmount: "",
  buyerCommissionRate: "0",
  buyerCommissionMin: "",
  buyerCommissionMax: "",
  buyerServiceFeeRate: "0",
  buyerServiceFeeMin: "",
  buyerServiceFeeMax: "",
  sellerCommissionRate: "0",
  sellerCommissionMin: "",
  sellerCommissionMax: "",
  sellerPlatformFeeRate: "0",
  sellerPlatformFeeMin: "",
  sellerPlatformFeeMax: "",
  tradeFeeSellerAmount: "0",
  tradeFeeBuyerAmount: "0",
  shippingBuyerShare: "100",
  shippingShareSmall: "",
  shippingShareMedium: "",
  shippingShareLarge: "",
};

const text = (value: number | null | undefined) =>
  value == null ? "" : String(value);

const tierShare = (rule: CommissionRule, tierCode: PackageTierCode) => {
  const share = rule.shippingShares.find((row) => row.tierCode === tierCode);
  return share ? String(share.buyerShare) : "";
};

export function ruleToForm(rule: CommissionRule): CommissionFormValues {
  return {
    name: rule.name,
    categoryId: rule.categoryId,
    sellerType: rule.sellerType,
    minAmount: text(rule.minAmount),
    maxAmount: text(rule.maxAmount),
    buyerCommissionRate: text(rule.buyerCommissionRate),
    buyerCommissionMin: text(rule.buyerCommissionMin),
    buyerCommissionMax: text(rule.buyerCommissionMax),
    buyerServiceFeeRate: text(rule.buyerServiceFeeRate),
    buyerServiceFeeMin: text(rule.buyerServiceFeeMin),
    buyerServiceFeeMax: text(rule.buyerServiceFeeMax),
    sellerCommissionRate: text(rule.sellerCommissionRate),
    sellerCommissionMin: text(rule.sellerCommissionMin),
    sellerCommissionMax: text(rule.sellerCommissionMax),
    sellerPlatformFeeRate: text(rule.sellerPlatformFeeRate),
    sellerPlatformFeeMin: text(rule.sellerPlatformFeeMin),
    sellerPlatformFeeMax: text(rule.sellerPlatformFeeMax),
    tradeFeeSellerAmount: text(rule.tradeFeeSellerAmount),
    tradeFeeBuyerAmount: text(rule.tradeFeeBuyerAmount),
    shippingBuyerShare: text(rule.shippingBuyerShare),
    shippingShareSmall: tierShare(rule, "small"),
    shippingShareMedium: tierShare(rule, "medium"),
    shippingShareLarge: tierShare(rule, "large"),
  };
}

const numberOrNull = (value: string) =>
  value.trim() === "" ? null : Number(value);

export function commissionFormToPayload(value: CommissionFormValues) {
  const bound = (rate: string, amount: string) =>
    Number(rate) === 0 ? null : numberOrNull(amount);
  return {
    name: value.name.trim(),
    categoryId: value.categoryId,
    sellerType: value.sellerType,
    minAmount: Number(value.minAmount),
    maxAmount: numberOrNull(value.maxAmount),
    buyerCommissionRate: Number(value.buyerCommissionRate),
    buyerCommissionMin: bound(
      value.buyerCommissionRate,
      value.buyerCommissionMin,
    ),
    buyerCommissionMax: bound(
      value.buyerCommissionRate,
      value.buyerCommissionMax,
    ),
    buyerServiceFeeRate: Number(value.buyerServiceFeeRate),
    buyerServiceFeeMin: bound(
      value.buyerServiceFeeRate,
      value.buyerServiceFeeMin,
    ),
    buyerServiceFeeMax: bound(
      value.buyerServiceFeeRate,
      value.buyerServiceFeeMax,
    ),
    sellerCommissionRate: Number(value.sellerCommissionRate),
    sellerCommissionMin: bound(
      value.sellerCommissionRate,
      value.sellerCommissionMin,
    ),
    sellerCommissionMax: bound(
      value.sellerCommissionRate,
      value.sellerCommissionMax,
    ),
    sellerPlatformFeeRate: Number(value.sellerPlatformFeeRate),
    sellerPlatformFeeMin: bound(
      value.sellerPlatformFeeRate,
      value.sellerPlatformFeeMin,
    ),
    sellerPlatformFeeMax: bound(
      value.sellerPlatformFeeRate,
      value.sellerPlatformFeeMax,
    ),
    tradeFeeSellerAmount: Number(value.tradeFeeSellerAmount),
    tradeFeeBuyerAmount: Number(value.tradeFeeBuyerAmount),
    shippingBuyerShare: Number(value.shippingBuyerShare),
    shippingShares: PACKAGE_TIER_CODES.map((tierCode) => ({
      tierCode,
      buyerShare: numberOrNull(
        value[
          `shippingShare${tierCode[0].toUpperCase()}${tierCode.slice(1)}` as keyof CommissionFormValues
        ] as string,
      ),
    })).filter(
      (share): share is { tierCode: PackageTierCode; buyerShare: number } =>
        share.buyerShare != null,
    ),
  };
}
