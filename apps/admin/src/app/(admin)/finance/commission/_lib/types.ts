import { z } from "zod";
import type { useTranslations } from "next-intl";

type T = ReturnType<typeof useTranslations<never>>;

export interface Category {
  id: string;
  name: string;
}

export type SellerType = "FREE" | "PREMIUM" | "BUSINESS" | "ALL";
export type AppliesTo = "SELLER" | "BUYER" | "BOTH";
export type TaxpayerType = "individual" | "corporate" | "all";

export interface CommissionRule {
  id: string;
  name: string;
  categoryId: string | null;
  categoryName: string | null;
  sellerType: SellerType | null;
  appliesTo: AppliesTo;
  taxpayerType?: TaxpayerType;
  minAmount?: number | null;
  maxAmount?: number | null;
  // legacy single rates
  sellerRate: number | null;
  buyerRate: number | null;
  sellerMin: number | null;
  sellerMax: number | null;
  buyerMin: number | null;
  buyerMax: number | null;
  // v2 four rates
  buyerCommissionRate?: number | null;
  buyerCommissionMin?: number | null;
  buyerCommissionMax?: number | null;
  buyerServiceFeeRate?: number | null;
  buyerServiceFeeMin?: number | null;
  buyerServiceFeeMax?: number | null;
  sellerCommissionRate?: number | null;
  sellerCommissionMin?: number | null;
  sellerCommissionMax?: number | null;
  sellerPlatformFeeRate?: number | null;
  sellerPlatformFeeMin?: number | null;
  sellerPlatformFeeMax?: number | null;
  shippingBuyerShare?: number | null;
  /** Paket boyutu başına kargo bölüşümü; satır yoksa shippingBuyerShare geçerlidir. */
  shippingShares?: Array<{
    tierCode: PackageTierCode;
    buyerShare: number | string;
  }>;
  priority?: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CommissionRevenue {
  totalCommission: number;
  totalBuyerFee: number;
  totalSellerFee: number;
  byMonth: Array<{ period: string; commission: number; orderCount: number }>;
}

export const sellerTypes = (t: T): { value: SellerType; label: string }[] => [
  { value: "FREE", label: t("admin.finance.commission.sellerTypes.free") },
  {
    value: "PREMIUM",
    label: t("admin.finance.commission.sellerTypes.premium"),
  },
  {
    value: "BUSINESS",
    label: t("admin.finance.commission.sellerTypes.business"),
  },
  { value: "ALL", label: t("common.all") },
];

export const taxpayerTypes = (
  t: T,
): { value: TaxpayerType; label: string }[] => [
  { value: "all", label: t("common.all") },
  {
    value: "individual",
    label: t("admin.finance.commission.taxpayer.individual"),
  },
  {
    value: "corporate",
    label: t("admin.finance.commission.taxpayer.corporate"),
  },
];

export const appliesToOptions = (
  t: T,
): { value: AppliesTo; label: string }[] => [
  { value: "BOTH", label: t("admin.finance.commission.both") },
  { value: "SELLER", label: t("admin.finance.common.seller") },
  { value: "BUYER", label: t("admin.finance.common.buyer") },
];

export const sellerTypeLabel = (v: SellerType | null, t: T) =>
  sellerTypes(t).find((item) => item.value === v)?.label ?? t("common.all");

export const taxpayerTypeLabel = (v: TaxpayerType | null | undefined, t: T) =>
  taxpayerTypes(t).find((item) => item.value === (v ?? "all"))?.label ??
  t("common.all");

export const appliesToLabel = (v: AppliesTo, t: T) =>
  appliesToOptions(t).find((item) => item.value === v)?.label ?? v;

/** A rule counts as the default when it matches every order (no category, any seller). */
export const isDefaultRule = (r: CommissionRule) =>
  !r.categoryId &&
  r.sellerType === "ALL" &&
  (r.taxpayerType ?? "all") === "all" &&
  r.isActive;

const rateField = z.string().optional().default("");
/** Kargo payı: boş = tek paya düş; dolu = 0–100 arası. */
const shareField = z.string().optional().default("");

/** Sabit üç paket boyutu — API'deki ShippingPackageTierCode ile aynı. */
export const PACKAGE_TIER_CODES = ["small", "medium", "large"] as const;
export type PackageTierCode = (typeof PACKAGE_TIER_CODES)[number];

/** Kuralın bir boyut için kayıtlı payı; yoksa boş (tek paya düşer). */
function tierShare(rule: CommissionRule, code: PackageTierCode): string {
  const share = rule.shippingShares?.find((row) => row.tierCode === code);
  return share ? String(share.buyerShare) : "";
}

/** Form schema — validation-only; strings are shaped to numbers/nulls in the mutationFn. */
export const commissionSchema = (t: T) =>
  z
    .object({
      name: z
        .string()
        .min(1, t("admin.finance.commission.validation.nameRequired")),
      categoryId: z.string().optional().default(""),
      sellerType: z.enum(["FREE", "PREMIUM", "BUSINESS", "ALL"]).default("ALL"),
      taxpayerType: z.enum(["individual", "corporate", "all"]).default("all"),
      appliesTo: z.enum(["SELLER", "BUYER", "BOTH"]).default("BOTH"),
      minAmount: rateField,
      maxAmount: rateField,
      // 4 rate blocks
      buyerCommissionRate: rateField,
      buyerCommissionMin: rateField,
      buyerCommissionMax: rateField,
      buyerServiceFeeRate: rateField,
      buyerServiceFeeMin: rateField,
      buyerServiceFeeMax: rateField,
      sellerCommissionRate: rateField,
      sellerCommissionMin: rateField,
      sellerCommissionMax: rateField,
      sellerPlatformFeeRate: rateField,
      sellerPlatformFeeMin: rateField,
      sellerPlatformFeeMax: rateField,
      shippingBuyerShare: z.string().optional().default("100"),
      // Paket boyutu başına alıcı payı (%). Boş bırakılan boyut tek paya düşer.
      shippingShareSmall: shareField,
      shippingShareMedium: shareField,
      shippingShareLarge: shareField,
      priority: z.number().default(0),
      isActive: z.boolean().default(true),
    })
    .superRefine((v, ctx) => {
      // at least one rate
      const anyRate = [
        v.buyerCommissionRate,
        v.buyerServiceFeeRate,
        v.sellerCommissionRate,
        v.sellerPlatformFeeRate,
      ].some((r) => r && parseFloat(r) > 0);
      if (!anyRate)
        ctx.addIssue({
          code: "custom",
          path: ["sellerCommissionRate"],
          message: t("admin.finance.commission.validation.atLeastOneRate"),
        });
      // min <= max for each block + amount range
      const pairs: Array<[string, string, string]> = [
        ["buyerCommissionMin", "buyerCommissionMax", "buyerCommissionMax"],
        ["buyerServiceFeeMin", "buyerServiceFeeMax", "buyerServiceFeeMax"],
        ["sellerCommissionMin", "sellerCommissionMax", "sellerCommissionMax"],
        [
          "sellerPlatformFeeMin",
          "sellerPlatformFeeMax",
          "sellerPlatformFeeMax",
        ],
        ["minAmount", "maxAmount", "maxAmount"],
      ];
      for (const [minKey, maxKey, path] of pairs) {
        const min = (v as any)[minKey];
        const max = (v as any)[maxKey];
        if (min && max && parseFloat(min) > parseFloat(max))
          ctx.addIssue({
            code: "custom",
            path: [path],
            message: t("admin.finance.commission.validation.maxBelowMin"),
          });
      }
    });

export type CommissionFormValues = z.infer<ReturnType<typeof commissionSchema>>;

export const emptyCommissionForm: CommissionFormValues = {
  name: "",
  categoryId: "",
  sellerType: "ALL",
  taxpayerType: "all",
  appliesTo: "BOTH",
  minAmount: "",
  maxAmount: "",
  buyerCommissionRate: "",
  buyerCommissionMin: "",
  buyerCommissionMax: "",
  buyerServiceFeeRate: "",
  buyerServiceFeeMin: "",
  buyerServiceFeeMax: "",
  sellerCommissionRate: "8",
  sellerCommissionMin: "",
  sellerCommissionMax: "",
  sellerPlatformFeeRate: "",
  sellerPlatformFeeMin: "",
  sellerPlatformFeeMax: "",
  shippingBuyerShare: "100",
  shippingShareSmall: "",
  shippingShareMedium: "",
  shippingShareLarge: "",
  priority: 0,
  isActive: true,
};

const s = (v: number | null | undefined) => (v != null ? String(v) : "");

export function ruleToForm(rule: CommissionRule): CommissionFormValues {
  // v2 rates fall back to legacy so editing an old rule pre-fills sensibly.
  return {
    name: rule.name,
    categoryId: rule.categoryId ?? "",
    sellerType: rule.sellerType ?? "ALL",
    taxpayerType: rule.taxpayerType ?? "all",
    appliesTo: rule.appliesTo ?? "BOTH",
    minAmount: s(rule.minAmount),
    maxAmount: s(rule.maxAmount),
    buyerCommissionRate: s(rule.buyerCommissionRate),
    buyerCommissionMin: s(rule.buyerCommissionMin),
    buyerCommissionMax: s(rule.buyerCommissionMax),
    buyerServiceFeeRate: s(rule.buyerServiceFeeRate ?? rule.buyerRate),
    buyerServiceFeeMin: s(rule.buyerServiceFeeMin ?? rule.buyerMin),
    buyerServiceFeeMax: s(rule.buyerServiceFeeMax ?? rule.buyerMax),
    sellerCommissionRate: s(rule.sellerCommissionRate ?? rule.sellerRate),
    sellerCommissionMin: s(rule.sellerCommissionMin ?? rule.sellerMin),
    sellerCommissionMax: s(rule.sellerCommissionMax ?? rule.sellerMax),
    sellerPlatformFeeRate: s(rule.sellerPlatformFeeRate),
    sellerPlatformFeeMin: s(rule.sellerPlatformFeeMin),
    sellerPlatformFeeMax: s(rule.sellerPlatformFeeMax),
    shippingBuyerShare: s(rule.shippingBuyerShare ?? 100),
    shippingShareSmall: tierShare(rule, "small"),
    shippingShareMedium: tierShare(rule, "medium"),
    shippingShareLarge: tierShare(rule, "large"),
    priority: rule.priority ?? 0,
    isActive: rule.isActive,
  };
}

const num = (v: string) => (v ? parseFloat(v) : null);

/** Shape form values into the create/update API payload. */
export function commissionFormToPayload(v: CommissionFormValues) {
  return {
    name: v.name.trim(),
    categoryId: v.categoryId || null,
    sellerType: v.sellerType,
    taxpayerType: v.taxpayerType,
    appliesTo: v.appliesTo,
    minAmount: num(v.minAmount),
    maxAmount: num(v.maxAmount),
    buyerCommissionRate: num(v.buyerCommissionRate),
    buyerCommissionMin: num(v.buyerCommissionMin),
    buyerCommissionMax: num(v.buyerCommissionMax),
    buyerServiceFeeRate: num(v.buyerServiceFeeRate),
    buyerServiceFeeMin: num(v.buyerServiceFeeMin),
    buyerServiceFeeMax: num(v.buyerServiceFeeMax),
    sellerCommissionRate: num(v.sellerCommissionRate),
    sellerCommissionMin: num(v.sellerCommissionMin),
    sellerCommissionMax: num(v.sellerCommissionMax),
    sellerPlatformFeeRate: num(v.sellerPlatformFeeRate),
    sellerPlatformFeeMin: num(v.sellerPlatformFeeMin),
    sellerPlatformFeeMax: num(v.sellerPlatformFeeMax),
    shippingBuyerShare: num(v.shippingBuyerShare),
    // Yalnız DOLDURULAN boyutlar gönderilir; boş kalan boyut tek paya düşer.
    shippingShares: PACKAGE_TIER_CODES.map((code) => ({
      tierCode: code,
      buyerShare: num(
        v[
          `shippingShare${code[0].toUpperCase()}${code.slice(1)}` as keyof CommissionFormValues
        ] as string,
      ),
    })).filter(
      (share): share is { tierCode: PackageTierCode; buyerShare: number } =>
        share.buyerShare != null,
    ),
    priority: v.priority,
    isActive: v.isActive,
  };
}
