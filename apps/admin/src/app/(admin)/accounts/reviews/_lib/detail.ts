import type { Review, ReviewStatus, UserRating } from "./types";

export type ReviewLinkKind = "product" | "order" | "trade" | "seller";

export interface ReviewDetailLink {
  kind: ReviewLinkKind;
  /** Bağlantı metni (ürün adı, satıcı adı ya da kısa kod). */
  label: string;
  href: string;
}

/** Ürün ve satıcı yorumunun çekmecede AYNI çizilen ortak görünümü. */
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
}

/** API görseli düz URL ya da `{ url }` olabilir; boşlar atılır. */
export function normalizeReviewImages(
  images: Array<string | { url: string }> | null | undefined,
): string[] {
  return (images ?? [])
    .map((image) => (typeof image === "string" ? image : image?.url))
    .filter((url): url is string => !!url);
}

const userHref = (id?: string) => (id ? `/accounts/users/${id}` : undefined);

/** Kısa kod: uzun kimlik tek satıra sığsın diye ilk 8 karakter. */
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
  };
}
