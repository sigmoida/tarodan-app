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
import type { BadgeVariant } from "@tarodan/ui";
import type { ListingEditPayload } from "@tarodan/listing-form";
import type {
  AdminListingRemovalEvent,
  AdminListingRemovalSummary,
} from "@tarodan/types";

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
  /** Güncel kaldırma özeti; vitrindeki ilan için `null`. */
  removal?: AdminListingRemovalSummary | null;
  /**
   * Kaldırma geçmişi (yeniden eskiye) — satıcının serbest metni DAHİL; yalnız
   * bu admin ucu döndürür.
   */
  removalHistory?: AdminListingRemovalEvent[];
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
): Record<string, { label: string; variant: BadgeVariant }> => ({
  pending: {
    label: t("common.pending"),
    variant: "warning",
  },
  active: {
    label: t("common.active"),
    variant: "success",
  },
  inactive: {
    label: t("common.inactive"),
    variant: "outline",
  },
  rejected: {
    label: t("common.rejected"),
    variant: "danger",
  },
  reserved: {
    label: t("admin.catalog.products.statusReserved"),
    variant: "default",
  },
  sold: {
    label: t("admin.catalog.products.statusSold"),
    variant: "default",
  },
  deleted: {
    label: t("admin.catalog.products.statusDeleted"),
    variant: "danger",
  },
});
