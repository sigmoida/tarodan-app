import type { StatusConfig } from "@tarodan/ui";
import type { useTranslations } from "next-intl";

type T = ReturnType<typeof useTranslations<never>>;

export type ReviewStatus = "pending" | "approved" | "rejected";

export interface Review {
  id: string;
  score: number;
  title?: string;
  review?: string;
  status: ReviewStatus;
  adminReply?: string;
  adminReplyAt?: string;
  createdAt: string;
  isVerifiedPurchase: boolean;
  user: {
    id: string;
    displayName: string;
    email: string;
    avatarUrl?: string;
  };
  product: { id: string; title: string; images: { url: string }[] };
}

export interface UserRating {
  id: string;
  score: number;
  comment?: string;
  status?: ReviewStatus;
  createdAt: string;
  orderId?: string;
  tradeId?: string;
  giver: {
    id: string;
    displayName: string;
    email: string;
    avatarUrl?: string;
  };
  receiver: {
    id: string;
    displayName: string;
    email: string;
    avatarUrl?: string;
  };
}

export const reviewStatusConfig = (t: T): Record<string, StatusConfig> => ({
  approved: { label: t("common.approved"), variant: "success" },
  pending: { label: t("common.pending"), variant: "warning" },
  rejected: { label: t("common.rejected"), variant: "danger" },
});

export const reviewTabs = (t: T) => [
  { key: "product", label: t("admin.accounts.reviews.tabs.product") },
  { key: "seller", label: t("admin.accounts.reviews.tabs.seller") },
];

export const reviewStatusOptions = (t: T) => [
  { value: "all", label: t("admin.accounts.reviews.allStatuses") },
  { value: "pending", label: t("admin.accounts.reviews.filters.pending") },
  { value: "approved", label: t("admin.accounts.reviews.filters.approved") },
  { value: "rejected", label: t("admin.accounts.reviews.filters.rejected") },
];

export const statusLabels = (t: T): Record<ReviewStatus, string> => ({
  approved: t("admin.accounts.reviews.actionResult.approved"),
  pending: t("admin.accounts.reviews.actionResult.pending"),
  rejected: t("admin.accounts.reviews.actionResult.rejected"),
});

/** Confirm-dialog copy per target status. */
export const reviewActionConfirm = (
  t: T,
): Record<
  ReviewStatus,
  {
    title: string;
    description: string;
    confirmLabel: string;
    destructive?: boolean;
  }
> => ({
  approved: {
    title: t("admin.accounts.reviews.confirm.approveTitle"),
    description: t("admin.accounts.reviews.confirm.approveDescription"),
    confirmLabel: t("common.confirm"),
  },
  rejected: {
    title: t("admin.accounts.reviews.confirm.rejectTitle"),
    description: t("admin.accounts.reviews.confirm.rejectDescription"),
    confirmLabel: t("admin.accounts.reviews.reject"),
    destructive: true,
  },
  pending: {
    title: t("admin.accounts.reviews.confirm.revertTitle"),
    description: t("admin.accounts.reviews.confirm.revertDescription"),
    confirmLabel: t("admin.accounts.reviews.revert"),
  },
});
