/** @format */

"use client";

import { listingsApi } from "@/lib/api";
import { useWebList } from "@/hooks/useWebResource";
import {
  getProductEffectivePrice,
  getProductOriginalPriceForDisplay,
  isProductOnSaleDisplay,
} from "@/lib/productPrice";
import type { CheckoutItem } from "../_lib/types";

const PLACEHOLDER = "https://placehold.co/96x96/f3f4f6/9ca3af?text=Ürün";

/**
 * "Buy now" single product resolved from `?productId=`. Replaces the manual
 * `fetchDirectProduct`; returns a ready `CheckoutItem` or null. The error → toast
 * + redirect side effect is handled by the caller via `isError`.
 */
export function useDirectProduct(
  directProductId: string | null,
  locale: string,
) {
  const query = useWebList<CheckoutItem>({
    resource: "checkout-direct-product",
    params: directProductId,
    fetcher: async () => {
      const response = await listingsApi.getOne(directProductId!);
      const product = response.data.product || response.data;
      const effectivePrice = getProductEffectivePrice(product);
      const onSale = isProductOnSaleDisplay(product);
      const originalPriceForDisplay = onSale
        ? getProductOriginalPriceForDisplay(product)
        : undefined;
      return {
        id: `direct-${product.id}`,
        productId: product.id,
        title: product.title,
        price: effectivePrice,
        originalPrice:
          originalPriceForDisplay != null &&
          originalPriceForDisplay > effectivePrice
            ? originalPriceForDisplay
            : undefined,
        imageUrl:
          product.images?.[0]?.cardUrl ??
          product.images?.[0]?.detailUrl ??
          product.images?.[0]?.url ??
          (typeof product.images?.[0] === "string"
            ? product.images[0]
            : null) ??
          PLACEHOLDER,
        seller: {
          id: product.sellerId || product.seller?.id,
          displayName:
            product.seller?.displayName ||
            (locale === "en" ? "Seller" : "Satıcı"),
        },
      };
    },
    enabled: !!directProductId,
  });

  return {
    directProduct: query.data ?? null,
    directProductError: query.isError,
  };
}
