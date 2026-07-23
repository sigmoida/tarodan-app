/** @format */

"use client";

import { createTranslator } from "next-intl";
import { getMessages, resolveLocale } from "@tarodan/i18n";
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
  const t = createTranslator({
    locale,
    messages: getMessages(resolveLocale(locale)),
  });
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
      // Adet tavanı: müsait stok (rezervasyon düşülmüş) ∧ 20 sipariş-cap'i.
      const avail = product.availableQuantity ?? product.quantity;
      const maxQuantity =
        typeof avail === "number" && avail > 0
          ? Math.min(avail, 20)
          : undefined;
      return {
        id: `direct-${product.id}`,
        productId: product.id,
        title: product.title,
        price: effectivePrice,
        // Adet CheckoutContext'teki `directQuantity` ile override edilir (stepper).
        quantity: 1,
        maxQuantity,
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
          displayName: product.seller?.displayName || t("product.seller"),
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
