/** @format */

"use client";

import { listingsApi } from "@/lib/api";
import { useWebItem } from "@/hooks/useWebResource";
import type { Product } from "@/types/product";

/** The listing endpoint includes a `category` relation not on the base card type. */
export type UnavailableProduct = Product & {
  category?: { id?: string; name?: string; slug?: string } | null;
};

/**
 * Loads the (possibly unavailable) product + a set of similar products, and
 * derives whether it is actually back in stock (admin restock / refund), in
 * which case the page nudges the user straight to the live listing.
 */
export function useUnavailableProduct(productId: string) {
  const productQuery = useWebItem<UnavailableProduct | null>({
    resource: "unavailable-product",
    id: productId,
    fetcher: async (id): Promise<UnavailableProduct | null> => {
      try {
        return (await listingsApi.getById(id)).data as UnavailableProduct;
      } catch {
        return null;
      }
    },
    enabled: !!productId,
  });

  const similarQuery = useWebItem<Product[]>({
    resource: "unavailable-product-similar",
    id: productId,
    fetcher: async (id): Promise<Product[]> => {
      try {
        return ((await listingsApi.getSimilar(id, 12)).data as Product[]) ?? [];
      } catch {
        return [];
      }
    },
    enabled: !!productId,
  });

  const product = productQuery.data ?? null;
  // Available = quantity - reserved; null/undefined = unlimited. A reserved item
  // (another buyer's pending order) is NOT "back in stock".
  const available = product?.availableQuantity;
  const isBackInStock =
    !!product &&
    product.status === "active" &&
    (available == null || available > 0);

  return {
    product,
    similar: similarQuery.data ?? [],
    isLoading: productQuery.isLoading || similarQuery.isLoading,
    isBackInStock,
  };
}
