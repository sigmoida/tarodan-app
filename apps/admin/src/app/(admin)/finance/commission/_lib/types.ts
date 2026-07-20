import { z } from "zod";
import type { useTranslations } from "next-intl";

type T = ReturnType<typeof useTranslations<never>>;

export interface Category {
  id: string;
  name: string;
}

export type SellerType = "FREE" | "PREMIUM" | "BUSINESS" | "ALL";
export type AppliesTo = "SELLER" | "BUYER" | "BOTH";

export interface CommissionRule {
  id: string;
  name: string;
  categoryId: string | null;
  categoryName: string | null;
  sellerType: SellerType | null;
  appliesTo: AppliesTo;
  sellerRate: number | null;
  buyerRate: number | null;
  sellerMin: number | null;
  sellerMax: number | null;
  buyerMin: number | null;
  buyerMax: number | null;
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

export const appliesToOptions = (
  t: T,
): { value: AppliesTo; label: string }[] => [
  { value: "SELLER", label: t("admin.finance.common.seller") },
  { value: "BUYER", label: t("admin.finance.common.buyer") },
  { value: "BOTH", label: t("admin.finance.commission.both") },
];

export const sellerTypeLabel = (v: SellerType | null, t: T) =>
  sellerTypes(t).find((item) => item.value === v)?.label ?? t("common.all");

export const appliesToLabel = (v: AppliesTo, t: T) =>
  appliesToOptions(t).find((item) => item.value === v)?.label ?? v;

/** A rule counts as the default when it matches every order (no category, any seller). */
export const isDefaultRule = (r: CommissionRule) =>
  !r.categoryId && r.sellerType === "ALL" && r.isActive;

/** Form schema — validation-only; strings are shaped to numbers/nulls in the mutationFn. */
export const commissionSchema = (t: T) =>
  z
    .object({
      name: z
        .string()
        .min(1, t("admin.finance.commission.validation.nameRequired")),
      categoryId: z.string().optional().default(""),
      sellerType: z.enum(["FREE", "PREMIUM", "BUSINESS", "ALL"]).default("ALL"),
      appliesTo: z.enum(["SELLER", "BUYER", "BOTH"]).default("SELLER"),
      sellerRate: z.string().optional().default(""),
      buyerRate: z.string().optional().default(""),
      sellerMin: z.string().optional().default(""),
      sellerMax: z.string().optional().default(""),
      buyerMin: z.string().optional().default(""),
      buyerMax: z.string().optional().default(""),
      priority: z.number().default(0),
      isActive: z.boolean().default(true),
    })
    .superRefine((v, ctx) => {
      const needsSeller = v.appliesTo === "SELLER" || v.appliesTo === "BOTH";
      const needsBuyer = v.appliesTo === "BUYER" || v.appliesTo === "BOTH";
      if (needsSeller && !v.sellerRate)
        ctx.addIssue({
          code: "custom",
          path: ["sellerRate"],
          message: t("admin.finance.commission.validation.sellerRateRequired"),
        });
      if (needsBuyer && !v.buyerRate)
        ctx.addIssue({
          code: "custom",
          path: ["buyerRate"],
          message: t("admin.finance.commission.validation.buyerRateRequired"),
        });
      if (
        v.sellerMin &&
        v.sellerMax &&
        parseFloat(v.sellerMin) > parseFloat(v.sellerMax)
      )
        ctx.addIssue({
          code: "custom",
          path: ["sellerMax"],
          message: t("admin.finance.commission.validation.maxBelowMin"),
        });
      if (
        v.buyerMin &&
        v.buyerMax &&
        parseFloat(v.buyerMin) > parseFloat(v.buyerMax)
      )
        ctx.addIssue({
          code: "custom",
          path: ["buyerMax"],
          message: t("admin.finance.commission.validation.maxBelowMin"),
        });
    });

export type CommissionFormValues = z.infer<ReturnType<typeof commissionSchema>>;

export const emptyCommissionForm: CommissionFormValues = {
  name: "",
  categoryId: "",
  sellerType: "ALL",
  appliesTo: "SELLER",
  sellerRate: "5",
  buyerRate: "0",
  sellerMin: "",
  sellerMax: "",
  buyerMin: "",
  buyerMax: "",
  priority: 0,
  isActive: true,
};

export function ruleToForm(rule: CommissionRule): CommissionFormValues {
  return {
    name: rule.name,
    categoryId: rule.categoryId ?? "",
    sellerType: rule.sellerType ?? "ALL",
    appliesTo: rule.appliesTo ?? "SELLER",
    sellerRate: rule.sellerRate?.toString() ?? "0",
    buyerRate: rule.buyerRate?.toString() ?? "0",
    sellerMin: rule.sellerMin?.toString() ?? "",
    sellerMax: rule.sellerMax?.toString() ?? "",
    buyerMin: rule.buyerMin?.toString() ?? "",
    buyerMax: rule.buyerMax?.toString() ?? "",
    priority: rule.priority ?? 0,
    isActive: rule.isActive,
  };
}

const num = (s: string) => (s ? parseFloat(s) : null);

/** Shape form values into the create/update API payload. */
export function commissionFormToPayload(v: CommissionFormValues) {
  return {
    name: v.name.trim(),
    categoryId: v.categoryId || null,
    sellerType: v.sellerType,
    appliesTo: v.appliesTo,
    sellerRate: num(v.sellerRate),
    buyerRate: num(v.buyerRate),
    sellerMin: num(v.sellerMin),
    sellerMax: num(v.sellerMax),
    buyerMin: num(v.buyerMin),
    buyerMax: num(v.buyerMax),
    priority: v.priority,
    isActive: v.isActive,
  };
}
