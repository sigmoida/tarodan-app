/**
 * The one action button a listing card shows: web grids, web My listings and
 * mobile cards all derive it from this rule, so the surfaces cannot drift.
 *
 * - The viewer's own listing: "boost" ("extend" when already boosted) while it
 *   is active and the viewer can buy a boost (web: boost sales on; mobile:
 *   `CAN_BUY_DIGITAL`, which is off, so mobile shows nothing). Never "add to
 *   cart": you cannot buy your own listing.
 * - Anyone else's listing, guests included: "add to cart" while it is active
 *   and in stock.
 * - Otherwise nothing.
 *
 * Not built (YAGNI): the schema has no variants and no listing that cannot be
 * bought, so there is no "choose a variant, link to the detail page" branch and
 * no "trade only, no button" branch. If such listings appear, they are new
 * cases here, checked before "add to cart".
 */
export type ProductCardAction =
  | { kind: "add_to_cart" }
  | { kind: "boost"; extend: boolean }
  | { kind: "none" };

export interface ProductCardActionProduct {
  sellerId: string | null | undefined;
  status: string | null | undefined;
  /**
   * Units that can still be bought. Null or undefined means unlimited stock
   * (the API omits the field for a listing without a quantity).
   */
  availableQuantity: number | null | undefined;
  isBoosted: boolean | null | undefined;
}

export interface ProductCardActionViewer {
  /** Null for a guest. */
  userId: string | null | undefined;
  /** Web: boost sales are on. Mobile: `CAN_BUY_DIGITAL`. */
  canBoost: boolean;
}

/** The listing status a card action needs. */
const ACTIVE_STATUS = "active";

export function productCardAction(
  product: ProductCardActionProduct,
  viewer: ProductCardActionViewer,
): ProductCardAction {
  const active = product.status === ACTIVE_STATUS;
  const own =
    viewer.userId != null &&
    product.sellerId != null &&
    product.sellerId === viewer.userId;

  if (own) {
    return active && viewer.canBoost
      ? { kind: "boost", extend: product.isBoosted === true }
      : { kind: "none" };
  }

  const inStock =
    product.availableQuantity == null || product.availableQuantity > 0;
  return active && inStock ? { kind: "add_to_cart" } : { kind: "none" };
}
