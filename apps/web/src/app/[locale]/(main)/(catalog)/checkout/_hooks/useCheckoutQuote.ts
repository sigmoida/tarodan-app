/** @format */

"use client";

import { ordersApi } from "@/lib/api";
import { useWebList } from "@/hooks/useWebResource";
import type { CheckoutQuote } from "../_lib/types";

/**
 * Server pricing quote (subtotal + shipping + platform fee + tax) for the current
 * items. The key includes each product id AND quantity so it refetches when the
 * cart changes OR a quantity stepper changes an adet (önizleme = tahsilat).
 */
export function useCheckoutQuote(
  items: Array<{ productId: string; quantity: number }>,
  couponCode?: string | null,
) {
  // Kupon da anahtara girer → kupon değişince yeniden fetch. Kupon server'da uygulanır
  // (fee/tax/kargo indirimli baz üzerinden) → pricing.totalAmount = tahsil edilen tutar.
  const key =
    items.map((i) => `${i.productId}:${i.quantity}`).join(",") +
    `|coupon:${couponCode ?? ""}`;
  const query = useWebList<CheckoutQuote | null>({
    resource: "checkout-quote",
    params: key,
    fetcher: async () => {
      const res = await ordersApi.getQuote({
        items: items.map((i) => ({
          productId: i.productId,
          quantity: i.quantity,
        })),
        ...(couponCode ? { couponCode } : {}),
      });
      if (res.data?.pricing)
        return {
          items: res.data.items ?? [],
          unavailableItems: res.data.unavailableItems ?? [],
          pricing: res.data.pricing,
          couponDiscount: res.data.couponDiscount ?? 0,
          shippingTariffVersion: res.data.shippingTariffVersion ?? null,
          commissionRuleSetId: res.data.commissionRuleSetId ?? null,
          commissionRuleSetVersion: res.data.commissionRuleSetVersion ?? null,
          pricingHash: res.data.pricingHash,
        };
      return (res.data ?? null) as CheckoutQuote | null;
    },
    enabled: items.length > 0,
  });

  return {
    quote: query.data ?? null,
    quoteLoading: query.isFetching && items.length > 0,
    quoteError: query.isError,
  };
}
