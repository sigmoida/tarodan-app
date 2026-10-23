import type {
  Review,
  ReviewModeration,
  ReviewStatus,
  UserRating,
} from "./types";

export type ReviewLinkKind = "product" | "order" | "trade" | "seller";

export interface ReviewDetailLink {
  kind: ReviewLinkKind;
  /** Link text (product title, seller name or a short code). */
  label: string;
  href: string;
}

/** The shared view of a product or seller review, drawn the SAME in the drawer. */
export interface ReviewDetail {
  id: string;
  score: number;
  status: ReviewStatus;
  title?: string;
  text?: string;
  images: string[];
  adminReply?: string;
  adminReplyAt?: string;
  createdAt: string;
  isVerifiedPurchase?: boolean;
  author: { name: string; email?: string; href?: string };
  links: ReviewDetailLink[];
  /**
   * Last hide / show: time and moderator; null if never moderated. `reason`
   * is set only while the review is hidden (see `currentHideReason`).
   */
  moderation: {
    reason?: string;
    at: string;
    /** Moderator display name (admins have no detail page to link). */
    by?: string;
  } | null;
}

/**
 * The reason a review is hidden right now. Showing a review again keeps the
 * last hide reason on the row but moves the time and moderator to the
 * show-again action, so the old reason is only read while the review is
 * hidden; otherwise it would read as the reason of the admin who showed it.
 * The full history is in the audit log.
 */
export function currentHideReason(
  row: ReviewModeration & { status?: ReviewStatus },
): string | undefined {
  return row.status === "hidden"
    ? row.moderationReason || undefined
    : undefined;
}

/** The moderation record of a row; null until an admin has acted on it. */
export function toModerationDetail(
  row: ReviewModeration & { status?: ReviewStatus },
): ReviewDetail["moderation"] {
  if (!row.moderatedAt) return null;
  return {
    reason: currentHideReason(row),
    at: row.moderatedAt,
    by: row.moderatedBy?.displayName,
  };
}

/** An API image is a plain URL or `{ url }`; empty ones are dropped. */
export function normalizeReviewImages(
  images: Array<string | { url: string }> | null | undefined,
): string[] {
  return (images ?? [])
    .map((image) => (typeof image === "string" ? image : image?.url))
    .filter((url): url is string => !!url);
}

const userHref = (id?: string) => (id ? `/accounts/users/${id}` : undefined);

/** Short code: the first 8 characters, so a long id fits on one line. */
const shortId = (id: string) => id.slice(0, 8);

export function toProductReviewDetail(row: Review): ReviewDetail {
  const links: ReviewDetailLink[] = [];
  if (row.product?.id) {
    links.push({
      kind: "product",
      label: row.product.title,
      href: `/catalog/products/${row.product.id}`,
    });
  }
  if (row.orderId) {
    links.push({
      kind: "order",
      label: shortId(row.orderId),
      href: `/operations/orders/${row.orderId}`,
    });
  }
  if (row.sellerId) {
    links.push({
      kind: "seller",
      label: shortId(row.sellerId),
      href: `/accounts/users/${row.sellerId}`,
    });
  }
  return {
    id: row.id,
    score: row.score,
    status: row.status,
    title: row.title || undefined,
    text: row.review || undefined,
    images: normalizeReviewImages(row.images),
    adminReply: row.adminReply || undefined,
    adminReplyAt: row.adminReplyAt,
    createdAt: row.createdAt,
    isVerifiedPurchase: row.isVerifiedPurchase,
    author: {
      name: row.user.displayName,
      email: row.user.email,
      href: userHref(row.user.id),
    },
    links,
    moderation: toModerationDetail(row),
  };
}

export function toSellerReviewDetail(row: UserRating): ReviewDetail {
  const links: ReviewDetailLink[] = [];
  if (row.receiver?.id) {
    links.push({
      kind: "seller",
      label: row.receiver.displayName || row.receiver.email,
      href: `/accounts/users/${row.receiver.id}`,
    });
  }
  if (row.orderId) {
    links.push({
      kind: "order",
      label: shortId(row.orderId),
      href: `/operations/orders/${row.orderId}`,
    });
  }
  if (row.tradeId) {
    links.push({
      kind: "trade",
      label: shortId(row.tradeId),
      href: `/operations/trades/${row.tradeId}`,
    });
  }
  return {
    id: row.id,
    score: row.score,
    status: row.status ?? "approved",
    text: row.comment || undefined,
    images: normalizeReviewImages(row.images),
    adminReply: row.adminReply || undefined,
    adminReplyAt: row.adminReplyAt,
    createdAt: row.createdAt,
    author: {
      name: row.giver?.displayName ?? "—",
      email: row.giver?.email,
      href: userHref(row.giver?.id),
    },
    links,
    moderation: toModerationDetail(row),
  };
}
