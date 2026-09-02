/** Sabit üç paket boyutu — API'deki ShippingPackageTierCode ile aynı. */
export type PackageTierCode = "small" | "medium" | "large";

/** Kademe seçicisinin etiketleri (komisyon ekranındaki adlarla aynı anahtarlar). */
export const PACKAGE_TIER_OPTIONS = [
  { value: "small", labelKey: "admin.shippingTariffs.tierSmallName" },
  { value: "medium", labelKey: "admin.shippingTariffs.tierMediumName" },
  { value: "large", labelKey: "admin.shippingTariffs.tierLargeName" },
] as const satisfies ReadonlyArray<{
  value: PackageTierCode;
  labelKey: string;
}>;

import { useTranslations } from "next-intl";
import type { ListingEditPayload } from "@tarodan/listing-form";

type T = ReturnType<typeof useTranslations<never>>;

export interface ProductDetail {
  id: string;
  /** İnsan-okunur ilan numarası (U010001) — kalıcı, kullanıcıya gösterilir. */
  productCode: string;
  title: string;
  description: string;
  price: number;
  originalPrice?: number | null;
  salePrice?: number | null;
  isOnSale?: boolean;
  quantity?: number;
  /** Türetilmiş (kademenin üst sınırı) — yalnız admin görür. */
  shippingDesi: number;
  /** Satıcının seçtiği paket boyutu; admin moderasyonla düzeltebilir. */
  shippingPackageTier?: PackageTierCode;
  condition: string;
  modelCode?: string | null;
  color?: string | null;
  isBoxed?: boolean | null;
  scale?: string | null;
  material?: string | null;
  brand?: { id: string; name: string } | null;
  carModel?: { id: string; name: string } | null;
  manufacturer?: { id: string; name: string } | null;
  status: string;
  category: { id: string; name: string };
  seller: { id: string; displayName: string; email: string };
  images: Array<{ id: string; url: string; sortOrder: number }>;
  viewCount: number;
  createdAt: string;
  updatedAt: string;
  rejectionReason?: string;
  aiCheckStatus?: string | null;
  aiRelevanceScore?: number | null;
  aiNsfwScore?: number | null;
  aiCheckReason?: string | null;
  /**
   * Kaydın ham hâli (düzenleme ekranıyla ortak). Detay sayfası özel grup
   * seçimlerini (Nadirlik gibi) `edit.attributes` üzerinden gösterir.
   */
  edit?: Pick<ListingEditPayload, "attributes"> | null;
  /** Ürüne verilen toplam teklif sayısı (tüm durumlar) — hızlı link rozeti. */
  _count?: { offers: number };
}

export interface Review {
  id: string;
  score: number;
  title?: string;
  review?: string;
  status: "pending" | "approved" | "rejected" | "deleted";
  adminReply?: string;
  adminReplyAt?: string;
  createdAt: string;
  isVerifiedPurchase: boolean;
  user: { id: string; displayName: string; email: string; avatarUrl?: string };
}

export const productStatusConfig = (
  t: T,
): Record<string, { label: string; color: string; bg: string }> => ({
  pending: {
    label: t("common.pending"),
    color: "text-warning-600",
    bg: "bg-warning-100",
  },
  active: {
    label: t("common.active"),
    color: "text-success-600",
    bg: "bg-success-100",
  },
  inactive: {
    label: t("common.inactive"),
    color: "text-muted",
    bg: "bg-surface-alt",
  },
  rejected: {
    label: t("common.rejected"),
    color: "text-danger-600",
    bg: "bg-danger-100",
  },
  reserved: {
    label: t("admin.catalog.products.statusReserved"),
    color: "text-info-600",
    bg: "bg-info-100",
  },
  sold: {
    label: t("admin.catalog.products.statusSold"),
    color: "text-primary-600",
    bg: "bg-primary-100",
  },
  deleted: {
    label: t("admin.catalog.products.statusDeleted"),
    color: "text-danger-600",
    bg: "bg-danger-100",
  },
});
