import { productStatusConfig, type StatusConfig } from "@tarodan/ui";
import { useTranslations } from "next-intl";
import { statusLabel } from "@/lib/statusLabels";

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
  /** İnsan-okunur ilan numarası (U010001). */
  productCode: string;
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
  seller: {
    id: string;
    displayName: string;
    email?: string;
    avatarUrl?: string;
  };
  category: { name: string };
  brand?: { name: string } | null;
  description?: string | null;
  relevanceScore?: number | null;
  isTradeEnabled?: boolean;
  quantity?: number | null;
  imageCount?: number;
  imageUrl?: string;
  createdAt: string;
  aiCheckStatus?: string | null;
}

// eslint-disable-next-line @tarodan/no-hardcoded-turkish -- URL query payload, not display copy
const PLACEHOLDER = "https://placehold.co/100x100/f3f4f6/666?text=Ürün";

/** Normalize the varied product payload (image url shapes, numeric strings). */
export function mapProducts(raw: any[], t: T): Product[] {
  return raw.map((p: any) => ({
    id: p.id,
    productCode: p.productCode,
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
    brand: p.brand ?? null,
    description: p.description ?? null,
    relevanceScore: p.relevanceScore ?? null,
    isTradeEnabled: !!p.isTradeEnabled,
    quantity: p.quantity != null ? Number(p.quantity) : null,
    imageCount: p._count?.images ?? (p.images?.length || undefined),
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

/** AI Denetim sekmesinin anahtarı (durum sekmelerinin yanında durur). */
export const AI_TAB = "ai";

/** Durum sekmelerinin sırası: operasyon önceliğine göre (onay bekleyen önde). */
export const PRODUCT_STATUS_TABS = [
  "active",
  "pending",
  "reserved",
  "sold",
  "inactive",
  "suspended",
  "rejected",
  "deleted",
] as const;
export type ProductStatusTab = (typeof PRODUCT_STATUS_TABS)[number];

export function isProductStatusTab(value: string): value is ProductStatusTab {
  return (PRODUCT_STATUS_TABS as readonly string[]).includes(value);
}

/**
 * Sekmeler = ürün durumları (etiketler rozetle aynı haritadan) + AI Denetim.
 * Durum artık kolon/filtre değil, sekmedir; `counts` "(n)" olarak yazılır.
 */
export const getProductTabs = (
  t: T,
  counts: Partial<Record<ProductStatusTab, number | undefined>> = {},
) => [
  ...PRODUCT_STATUS_TABS.map((value) => ({
    key: value,
    label: `${statusLabel(productStatusConfig, value, t)} (${
      counts[value] ?? "…"
    })`,
  })),
  { key: AI_TAB, label: t("admin.catalog.common.aiModeration") },
];
