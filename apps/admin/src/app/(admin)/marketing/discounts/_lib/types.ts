import type { StatusConfig } from "@tarodan/ui";
import { fmtTry } from "@/lib/format";
import type { useTranslations } from "next-intl";

type T = ReturnType<typeof useTranslations<never>>;

export interface Discount {
  id: string;
  code: string | null;
  name: string;
  description: string | null;
  type: "percentage" | "fixed_amount" | "bogo" | "bulk_quantity";
  value: number;
  scope: "global" | "category" | "product" | "seller";
  sellerId: string | null;
  sellerName: string | null;
  categoryId: string | null;
  categoryName: string | null;
  targetProductIds: string[];
  minCartValue: number | null;
  minQuantity: number | null;
  buyQuantity: number | null;
  getQuantity: number | null;
  maxDiscountAmount: number | null;
  usageLimitTotal: number | null;
  usageLimitPerUser: number;
  usedCount: number;
  isStackable: boolean;
  priority: number;
  isActive: boolean;
  isFlashSale: boolean;
  startDate: string;
  endDate: string;
  createdAt: string;
  isCurrentlyValid: boolean;
  remainingUsage: number | null;
}

export const scopeLabels = (t: T): Record<string, string> => ({
  global: t("admin.marketing.discounts.scope.global"),
  category: t("common.category"),
  product: t("admin.marketing.discounts.scope.product"),
  seller: t("admin.marketing.discounts.scope.seller"),
});

export const discountStatusConfig = (t: T): Record<string, StatusConfig> => ({
  inactive: { label: t("common.inactive"), variant: "secondary" },
  active: { label: t("common.active"), variant: "success" },
  pending: { label: t("common.pending"), variant: "warning" },
  expired: {
    label: t("admin.marketing.discounts.status.expired"),
    variant: "danger",
  },
  unknown: {
    label: t("admin.marketing.discounts.status.unknown"),
    variant: "secondary",
  },
});

/** Current status of a discount (active flag + date window). */
export function getDiscountStatus(d: Discount): string {
  if (!d.isActive) return "inactive";
  if (d.isCurrentlyValid) return "active";
  const now = new Date();
  if (now < new Date(d.startDate)) return "pending";
  if (now > new Date(d.endDate)) return "expired";
  return "unknown";
}

/** Turn a discount's value into a human-readable label (per type). */
export function discountValueLabel(d: Discount, t: T): string {
  if (d.type === "percentage") return `%${d.value}`;
  if (d.type === "fixed_amount") return fmtTry(d.value) ?? "—";
  if (d.type === "bogo") {
    return t("admin.marketing.discounts.bogoValue", {
      buy: d.buyQuantity ?? 0,
      get: d.getQuantity ?? 0,
      discount:
        d.value === 100
          ? t("admin.marketing.discounts.free")
          : t("admin.marketing.discounts.percentDiscount", { value: d.value }),
    });
  }
  if (d.type === "bulk_quantity")
    return t("admin.marketing.discounts.bulkValue", {
      quantity: d.minQuantity ?? 0,
      value: d.value,
    });
  return "—";
}

// ─── Filter & form options ───────────────────────────────────────────────────

export const scopeFilterOptions = (t: T) => [
  { value: "all", label: t("admin.marketing.discounts.allScopes") },
  ...Object.entries(scopeLabels(t)).map(([value, label]) => ({ value, label })),
];

export const activeFilterOptions = (t: T) => [
  { value: "all", label: t("admin.marketing.discounts.allStatuses") },
  { value: "true", label: t("common.active") },
  { value: "false", label: t("common.inactive") },
];

export const discountTypeOptions = (t: T) => [
  {
    value: "percentage",
    label: t("admin.marketing.discounts.type.percentage"),
  },
  {
    value: "fixed_amount",
    label: t("admin.marketing.discounts.type.fixedAmount"),
  },
  { value: "bogo", label: t("admin.marketing.discounts.type.bogo") },
  {
    value: "bulk_quantity",
    label: t("admin.marketing.discounts.type.bulkQuantity"),
  },
];

export const scopeFormOptions = (t: T) => [
  { value: "global", label: t("admin.marketing.discounts.scope.global") },
  { value: "category", label: t("common.category") },
];
