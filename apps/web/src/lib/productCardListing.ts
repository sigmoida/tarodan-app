/** @format */

import type { Product } from "@/types/product";

/**
 * What a listing card's action island needs, as primitives: a Server card
 * (`HomeProductCard`) passes it to the client island, so the RSC payload does
 * not carry the whole product. The fields are the inputs of
 * `productCardAction` (`@tarodan/types`) plus the title and boost end.
 */
export interface ProductCardListing {
  id: string;
  title: string;
  /** The seller (`seller.id`, else `sellerId`), or null when unknown. */
  sellerId: string | null;
  status: string | null;
  /** Null = unlimited stock. */
  availableQuantity: number | null;
  isBoosted: boolean;
  boostedUntil: string | null;
}

export function toProductCardListing(product: Product): ProductCardListing {
  const sellerId = product.seller?.id ?? product.sellerId;
  return {
    id: String(product.id),
    title: product.title,
    sellerId: sellerId != null ? String(sellerId) : null,
    status: product.status ?? null,
    availableQuantity: product.availableQuantity ?? null,
    isBoosted: product.isBoosted === true,
    boostedUntil: product.boostedUntil ?? null,
  };
}
