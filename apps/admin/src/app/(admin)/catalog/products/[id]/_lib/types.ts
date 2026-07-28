import { useTranslations } from "next-intl";

type T = ReturnType<typeof useTranslations<never>>;

export interface ProductDetail {
  id: string;
  title: string;
  description: string;
  price: number;
  originalPrice?: number | null;
  salePrice?: number | null;
  isOnSale?: boolean;
  quantity?: number;
  shippingDesi: number;
  condition: string;
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
