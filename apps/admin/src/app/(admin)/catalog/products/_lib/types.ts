import { productStatusConfig, type StatusConfig } from "@tarodan/ui";
import { useTranslations } from "next-intl";
import { statusFilterOptions } from "@/lib/utils";

type T = ReturnType<typeof useTranslations<never>>;

/** AI image-moderation status → badge. Anything outside known values counts as "clean". */
export const aiCheckConfig = (t: T): Record<string, StatusConfig> => ({
  flagged: { label: t("admin.catalog.products.aiFlagged"), variant: "danger" },
  review: { label: t("admin.catalog.products.aiReview"), variant: "warning" },
  passed: { label: t("admin.catalog.products.aiPassed"), variant: "success" },
});

/** Reduces aiCheckStatus to a config key (anything but flagged/review → passed). */
export const aiCheckKey = (s?: string | null) =>
  s === "flagged" || s === "review" ? s : "passed";

export interface Product {
  id: string;
  title: string;
  price: number;
  originalPrice?: number | null;
  salePrice?: number | null;
  isOnSale?: boolean;
  status:
    | "pending"
    | "active"
    | "rejected"
    | "sold"
    | "inactive"
    | "reserved"
    | "deleted";
  condition: string;
  seller: { id: string; displayName: string };
  category: { name: string };
  imageUrl?: string;
  createdAt: string;
  aiCheckStatus?: string | null;
}

const PLACEHOLDER = "https://placehold.co/100x100/f3f4f6/666?text=Ürün";

/** Normalize the varied product payload (image url shapes, numeric strings). */
export function mapProducts(raw: any[], t: T): Product[] {
  return raw.map((p: any) => ({
    id: p.id,
    title: p.title,
    price: Number(p.price),
    originalPrice: p.originalPrice != null ? Number(p.originalPrice) : null,
    salePrice: p.salePrice != null ? Number(p.salePrice) : null,
    isOnSale: p.isOnSale,
    status: p.status,
    condition: p.condition,
    seller: p.seller || {
      id: p.sellerId,
      displayName: t("admin.catalog.products.seller"),
    },
    category: p.category || { name: t("common.category") },
    imageUrl: (() => {
      let url = p.imageUrl || p.images?.[0]?.url || p.images?.[0] || "";
      if (url && !url.startsWith("/") && !url.startsWith("http"))
        url = "/" + url;
      return url || PLACEHOLDER;
    })(),
    createdAt: p.createdAt,
    aiCheckStatus: p.aiCheckStatus ?? null,
  }));
}

/** Status filter options derived from productStatusConfig (badge-consistent). */
export const getProductStatusOptions = (t: T) =>
  statusFilterOptions(productStatusConfig, {
    allLabel: t("admin.catalog.products.allProducts"),
  });

/** list ↔ AI moderation tabs (shared by the list and the AI branch). */
export const getProductTabs = (t: T) => [
  { key: "list", label: t("admin.catalog.products.title") },
  { key: "ai", label: t("admin.catalog.common.aiModeration") },
];
