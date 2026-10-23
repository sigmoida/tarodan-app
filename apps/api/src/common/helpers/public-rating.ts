import { Prisma, RatingStatus } from "@prisma/client";

/**
 * On public surfaces a "published rating" is ONLY `approved`.
 *
 * The counter and average on product cards, the review list on the product
 * page, the search document and the seller rating all feed from this one
 * definition. A surface that skipped it would create a "ghost review": shown
 * on the card but missing from the detail page or list. Every other status is
 * non-public: `hidden` (an admin took it down, with a reason), and the legacy
 * `pending` / `rejected` (fixture or old data), `spam` and `deleted`.
 *
 * The product cache columns (Product.averageRating / ratingCount) derive from
 * this rule too: RatingService.updateProductRatingStats counts only approved
 * rows. The nightly seller trust run reads the same constant.
 */
export const PUBLIC_RATING_STATUS = RatingStatus.approved;

/**
 * Whether a review or rating with this status shows publicly. The author's
 * own view uses it to flag a review that is not shown (`hidden: true`).
 */
export const isPublicRatingStatus = (status: RatingStatus): boolean =>
  status === PUBLIC_RATING_STATUS;

/**
 * ProductRating (product review): the base filter of every public query.
 * `status` is written LAST on purpose: it overrides a status the caller sent,
 * so a public path cannot build a where that leaks an unpublished row.
 */
export const publicProductRatingWhere = (
  where: Prisma.ProductRatingWhereInput = {},
): Prisma.ProductRatingWhereInput => ({
  ...where,
  status: PUBLIC_RATING_STATUS,
});

/** Rating (user/seller rating): the base filter of every public query. */
export const publicUserRatingWhere = (
  where: Prisma.RatingWhereInput = {},
): Prisma.RatingWhereInput => ({
  ...where,
  status: PUBLIC_RATING_STATUS,
});
