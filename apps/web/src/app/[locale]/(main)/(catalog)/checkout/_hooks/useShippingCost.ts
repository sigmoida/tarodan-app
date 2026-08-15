/** @format */

"use client";

import { api } from "@/lib/api";
import { useWebList } from "@/hooks/useWebResource";
import type { Translate } from "@/types/i18n";
import { useTranslations } from "next-intl";

/**
 * Şehir adı EŞLEŞME listesi — ekrana basılan metin değil, kullanıcının girdiği
 * şehir adının yerel tarife için karşılaştırıldığı değerlerdir; bu yüzden
 * katalogda değil burada durur.
 */
// eslint-disable-next-line @tarodan/no-hardcoded-turkish -- city-name match tokens, not display copy
/**
 * Şehir adı EŞLEŞME listesi — ekrana basılan metin değil, kullanıcının girdiği
 * şehir adının yerel tarife için karşılaştırıldığı değerlerdir; bu yüzden
 * katalogda değil burada durur.
 */
// eslint-disable-next-line @tarodan/no-hardcoded-turkish -- city-name match tokens, not display copy
const ISTANBUL = ["İstanbul", "istanbul", "Istanbul"];

/** Local fallback when the rates API has nothing (guests, or API failure). */
function localRate(city: string): number {
  return ISTANBUL.some((c) => city.toLowerCase().includes(c.toLowerCase()))
    ? 34.9
    : 49.9;
}

/**
 * Shipping cost for the destination city. Replaces the manual `useEffect` +
 * `useState` calculation: authed users try the rates API first, everyone falls
 * back to a local estimate. Disabled until a city + at least one item exist.
 */
export function useShippingCost({
  isAuthenticated,
  city,
  carrier,
  itemCount,
}: {
  isAuthenticated: boolean;
  city: string;
  carrier: string;
  itemCount: number;
}) {
  const enabled = !!city && itemCount > 0;

  const query = useWebList<number>({
    resource: "checkout-shipping",
    params: [city, carrier, isAuthenticated],
    fetcher: async () => {
      if (isAuthenticated) {
        const response = await api
          .get("/shipping/rates", {
            params: { city, carrier, weight: 0.5 },
          })
          .catch(() => null);
        if (response?.data?.rate) return response.data.rate;
      }
      return localRate(city);
    },
    enabled,
  });

  return {
    shippingCost: enabled ? (query.data ?? 0) : 0,
    shippingLoading: enabled && query.isLoading,
  };
}
