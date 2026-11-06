/**
 * One item of a collection as `GET /collections/:id` (and the add-item
 * endpoint) return it. An item is either a listing (`isCustom: false`) or a
 * custom entry the owner typed in (`isCustom: true`): a model that is not for
 * sale, with its own title, image and details.
 *
 * Clients branch on `isCustom`, which the API always sets.
 */
export interface CollectionItemSummary {
  id: string;
  /** The listing id; absent on a custom item. */
  productId?: string;
  /** Listing title, or the custom title for a custom item. */
  productTitle: string;
  /** Card image URL: the listing's card image, or `customImageUrl`. */
  productImage?: string;
  /**
   * Listing price in TL. **Absent on a custom item**: it is not for sale, so
   * clients show no price (never "0,00 TL").
   */
  productPrice?: number;
  /** Listing status (`active`, `sold`); absent on a custom item. */
  productStatus?: string;
  /** The listing's seller; null on a custom item. */
  sellerId?: string | null;
  sortOrder: number;
  isFeatured: boolean;
  /** Whether the listing's own boost is active (not a collection feature flag). */
  isBoosted?: boolean;
  /** ISO 8601 timestamp. */
  addedAt: string;
  isCustom: boolean;
  // Custom item fields: set only when `isCustom` is true, null when not filled in.
  customTitle?: string | null;
  customDescription?: string | null;
  customBrand?: string | null;
  customModel?: string | null;
  customYear?: number | null;
  customScale?: string | null;
  customManufacturer?: string | null;
  customMaterial?: string | null;
  /**
   * Public image URL on our own storage. New values are accepted only from
   * `POST /media/upload?folder=collections` by the item's owner (400
   * `server.collection.invalidImageUrl` otherwise).
   */
  customImageUrl?: string | null;
}
