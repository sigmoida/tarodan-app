/** @format */

"use client";

import { ordersApi } from "@/lib/api";
import { useWebList } from "@/hooks/useWebResource";
import type { CheckoutQuote } from "../_lib/types";

/**
 * Server pricing quote (subtotal + shipping + platform fee + tax) for the current
 * items. Replaces the manual `useEffect` fetch; the key includes the ordered
 * product ids so it refetches when the cart changes.
 */
export function useCheckoutQuote(productIds: string[]) {
  const key = productIds.join(",");
  const query = useWebList<CheckoutQuote | null>({
    resource: "checkout-quote",
    params: key,
    fetcher: async () => {
      const res = await ordersApi.getQuote({
        items: productIds.map((productId) => ({ productId, quantity: 1 })),
      });
      if (res.data?.pricing) return { pricing: res.data.pricing };
      return (res.data ?? null) as CheckoutQuote | null;
    },
    enabled: productIds.length > 0,
  });

  return {
    quote: query.data ?? null,
    quoteLoading: query.isLoading && productIds.length > 0,
    quoteError: query.isError,
  };
}
