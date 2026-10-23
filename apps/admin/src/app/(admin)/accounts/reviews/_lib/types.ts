import type { RatingStatusCode } from "@tarodan/types";
import type { useTranslations } from "next-intl";

type T = ReturnType<typeof useTranslations<never>>;

/** Every stored status of a review or user rating (the API's enum). */
export type ReviewStatus = RatingStatusCode;

/** Moderation record both list endpoints add to a row; null until moderated. */
export interface ReviewModeration {
  moderationReason?: string | null;
  moderatedAt?: string | null;
  moderatedBy?: { id: string; displayName: string } | null;
}

export interface Review extends ReviewModeration {
  id: string;
  score: number;
  title?: string;
  review?: string;
  status: ReviewStatus;
  adminReply?: string;
  adminReplyAt?: string;
  /** Review images: the API returns plain URLs or `{ url }`. */
  images?: Array<string | { url: string }>;
  orderId?: string;
  sellerId?: string;
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

export interface UserRating extends ReviewModeration {
  id: string;
  score: number;
  comment?: string;
  status?: ReviewStatus;
  images?: Array<string | { url: string }>;
  adminReply?: string;
  adminReplyAt?: string;
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

export const reviewTabs = (t: T) => [
  { key: "product", label: t("admin.accounts.reviews.tabs.product") },
  { key: "seller", label: t("admin.accounts.reviews.tabs.seller") },
];

export const reviewStatusOptions = (t: T) => [
  { value: "all", label: t("admin.accounts.reviews.allStatuses") },
  { value: "approved", label: t("admin.accounts.reviews.filters.approved") },
  { value: "hidden", label: t("admin.accounts.reviews.filters.hidden") },
  { value: "pending", label: t("admin.accounts.reviews.filters.pending") },
  { value: "rejected", label: t("admin.accounts.reviews.filters.rejected") },
];
