import type { PublicIdentity } from "./user";

export interface Rating {
  id: string;
  orderId: string;
  reviewerId: string;
  revieweeId: string;
  productId: string;
  score: number;
  comment?: string;
  isAnonymous: boolean;
  response?: string;
  responseAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface RatingWithDetails extends Rating {
  reviewer: PublicIdentity;
  reviewee: PublicIdentity;
  product: {
    id: string;
    name: string;
    images: string[];
  };
}

export interface RatingSummary {
  averageRating: number;
  totalRatings: number;
  distribution: {
    1: number;
    2: number;
    3: number;
    4: number;
    5: number;
  };
}

export interface CreateRatingDto {
  orderId: string;
  score: number;
  comment?: string;
  isAnonymous?: boolean;
}

export interface RespondToRatingDto {
  response: string;
}

// ── Review moderation (product reviews and user ratings) ────────────────────

/**
 * Every stored status of a product review or user rating (the API's Prisma
 * `RatingStatus`; a spec there pins the two lists). Only `approved` is public.
 * New reviews are `approved`; an admin hides one (`hidden`) and shows it again
 * (`approved`). `pending` and `rejected` remain only on legacy rows; `spam`
 * and `deleted` are never written.
 */
export const RATING_STATUSES = [
  "pending",
  "approved",
  "rejected",
  "spam",
  "deleted",
  "hidden",
] as const;
export type RatingStatusCode = (typeof RATING_STATUSES)[number];

/**
 * The statuses an admin can set with `PATCH /admin/reviews/:id/status` and
 * `PATCH /admin/user-ratings/:id/status`: show (`approved`) or hide (`hidden`).
 */
export const REVIEW_MODERATION_STATUSES = ["approved", "hidden"] as const;
export type ReviewModerationStatus =
  (typeof REVIEW_MODERATION_STATUSES)[number];

/**
 * Length of the moderation reason after trimming. Required to hide; optional
 * (a note for the audit log) to show again, up to the same maximum.
 */
export const REVIEW_MODERATION_REASON_MIN_LENGTH = 5;
export const REVIEW_MODERATION_REASON_MAX_LENGTH = 500;

/** Body of the two admin moderation endpoints. */
export interface ReviewModerationRequest {
  status: ReviewModerationStatus;
  /** Required (5-500 characters) when `status` is `hidden`. */
  reason?: string;
}

/**
 * `GET /orders/:id/my-review`: the buyer's own reviews of an order.
 * `hidden` is true when the review is not shown publicly (an admin hid it, or
 * a legacy unpublished row); the author still sees the content.
 */
export interface OrderOwnReview {
  product: {
    score: number;
    title: string | null;
    review: string | null;
    images: string[];
    createdAt: string;
    hidden: boolean;
  } | null;
  seller: {
    score: number;
    comment: string | null;
    createdAt: string;
    hidden: boolean;
  } | null;
}
