/** @format */

import type { Product } from "@/types/product";

export interface WishlistItem {
  id: string;
  productId: string;
  productTitle: string;
  productImage?: string;
  productPrice: number;
  productOriginalPrice?: number;
  productCondition?: string;
  productStatus?: string;
  sellerId: string;
  sellerName: string;
  addedAt: string | Date;
}

/** Map a wishlist row to the `Product` shape the shared `ProductCard` consumes. */
export const wishlistItemToProduct = (item: WishlistItem): Product => ({
  id: item.productId,
  title: item.productTitle,
  price: item.productPrice,
  images: item.productImage ? [{ url: item.productImage }] : [],
  condition: item.productCondition,
  originalPrice: item.productOriginalPrice,
  status: item.productStatus,
});
