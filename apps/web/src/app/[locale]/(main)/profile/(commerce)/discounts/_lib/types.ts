/** @format */

import type { StatusConfig } from "@tarodan/ui";

export interface Discount {
  id: string;
  code: string | null;
  name: string;
  description: string | null;
  type: "percentage" | "fixed_amount" | "bogo" | "bulk_quantity";
  value: number;
  /** Adet koşullu kampanyalar (bogo/bulk) — sepette kendiliğinden uygulanır. */
  minQuantity?: number | null;
  buyQuantity?: number | null;
  getQuantity?: number | null;
  scope: "global" | "category" | "product" | "seller";
  targetProductIds: string[];
  minCartValue: number | null;
  maxDiscountAmount: number | null;
  usageLimitTotal: number | null;
  usageLimitPerUser: number;
  usedCount: number;
  isStackable: boolean;
  priority: number;
  isActive: boolean;
  startDate: string;
  endDate: string;
  createdAt: string;
  isCurrentlyValid: boolean;
  remainingUsage: number | null;
}

export interface SellerProduct {
  id: string;
  title: string;
  price: number;
  images?: Array<{ url: string } | string>;
  status: string;
}

export interface DiscountFormData {
  code: string;
  name: string;
  description: string;
  type: "percentage" | "fixed_amount" | "bogo" | "bulk_quantity";
  value: number;
  /** bogo: "X al" / "Y bedava"; bulk_quantity: en az adet. String — input'tan. */
  buyQuantity: string;
  getQuantity: string;
  minQuantity: string;
  scope: "product" | "seller";
  targetProductIds: string[];
  minCartValue: string;
  maxDiscountAmount: string;
  usageLimitTotal: string;
  usageLimitPerUser: string;
  isStackable: boolean;
  isActive: boolean;
  startDate: string;
  endDate: string;
}

export type DiscountFilter = "all" | "active" | "inactive" | "expired";

export const FILTER_TABS: { value: DiscountFilter; label: string }[] = [
  { value: "all", label: "Tümü" },
  { value: "active", label: "Aktif" },
  { value: "inactive", label: "Pasif" },
  { value: "expired", label: "Süresi Dolmuş" },
];

export const SCOPE_LABELS: Record<string, string> = {
  seller: "Tüm Mağaza",
  product: "Seçili Ürünler",
};

export const discountStatusConfig: Record<string, StatusConfig> = {
  inactive: { label: "Pasif", variant: "secondary" },
  active: { label: "Aktif", variant: "success" },
  pending: { label: "Bekliyor", variant: "warning" },
  expired: { label: "Süresi Doldu", variant: "danger" },
  unknown: { label: "Belirsiz", variant: "secondary" },
};

export function getDiscountStatus(discount: Discount): string {
  if (!discount.isActive) return "inactive";
  if (discount.isCurrentlyValid) return "active";
  const now = new Date();
  if (now < new Date(discount.startDate)) return "pending";
  if (now > new Date(discount.endDate)) return "expired";
  return "unknown";
}

/** Filter a discount against a tab (client-side; keeps metrics tab-independent). */
export function matchesFilter(
  discount: Discount,
  filter: DiscountFilter,
): boolean {
  switch (filter) {
    case "active":
      return discount.isActive && discount.isCurrentlyValid;
    case "inactive":
      return !discount.isActive;
    case "expired":
      return new Date(discount.endDate) < new Date();
    default:
      return true;
  }
}

export const formatDate = (dateString: string): string =>
  new Date(dateString).toLocaleDateString("tr-TR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });

export const emptyDiscountForm = (): DiscountFormData => ({
  code: "",
  name: "",
  description: "",
  type: "percentage",
  value: 10,
  buyQuantity: "",
  getQuantity: "",
  minQuantity: "",
  scope: "seller",
  targetProductIds: [],
  minCartValue: "",
  maxDiscountAmount: "",
  usageLimitTotal: "",
  usageLimitPerUser: "1",
  isStackable: false,
  isActive: true,
  startDate: new Date().toISOString().split("T")[0],
  endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
    .toISOString()
    .split("T")[0],
});
