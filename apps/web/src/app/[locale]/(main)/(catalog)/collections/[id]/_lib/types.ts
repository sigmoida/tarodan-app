/** @format */

import type { Product } from "@/types/product";

export interface UserProduct {
  id: string;
  title: string;
  price: number;
  images?: Array<{ url: string } | string>;
}

export interface CollectionItem {
  id: string;
  productId?: string;
  productTitle: string;
  productImage?: string;
  productPrice?: number;
  productStatus?: string;
  sortOrder: number;
  isFeatured: boolean;
  isBoosted?: boolean;
  addedAt: string;
  isCustom: boolean;
  customTitle?: string;
  customDescription?: string;
  customBrand?: string;
  customModel?: string;
  customYear?: number;
  customScale?: string;
  customManufacturer?: string;
  customMaterial?: string;
  customImageUrl?: string;
}

export interface Collection {
  id: string;
  userId: string;
  userName: string;
  name: string;
  slug: string;
  description?: string;
  coverImageUrl?: string;
  isPublic: boolean;
  viewCount: number;
  likeCount: number;
  itemCount: number;
  items?: CollectionItem[];
  isLiked?: boolean;
  createdAt: string;
  updatedAt: string;
}

export const isUUID = (str: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);

/**
 * Map a collection item — real listing OR custom entry — to the `Product` shape
 * the shared `ProductCard` consumes, so both render through one component.
 * `status` is intentionally left off: SOLD is shown via the card overlay badge,
 * not the out-of-stock treatment.
 */
export const itemToProduct = (item: CollectionItem): Product => ({
  id: item.productId ?? item.id,
  title: item.isCustom
    ? item.customTitle || item.productTitle
    : item.productTitle,
  price: item.productPrice ?? 0,
  images:
    item.customImageUrl || item.productImage
      ? [{ url: (item.customImageUrl || item.productImage) as string }]
      : [],
  brand: item.customBrand,
  scale: item.customScale,
  year: item.customYear,
  isBoosted: Boolean(item.isBoosted) && item.productStatus !== "sold",
});

/**
 * Visible + ordered items. Hidden/deleted listings are dropped, but sold/reserved
 * ones stay (shown with a SOLD badge) so a collection never looks empty after a
 * product sells. Featured items float to the top, then `sortOrder`.
 */
export const sortCollectionItems = (
  items: Collection["items"],
): CollectionItem[] =>
  items
    ? [...items]
        .filter(
          (item) =>
            item.isCustom ||
            !item.productStatus ||
            ["active", "sold", "reserved", "inactive"].includes(
              item.productStatus,
            ),
        )
        .sort((a, b) => {
          if (a.isFeatured && !b.isFeatured) return -1;
          if (!a.isFeatured && b.isFeatured) return 1;
          return a.sortOrder - b.sortOrder;
        })
    : [];
