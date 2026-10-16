/** @format */

"use client";

import { useQuery } from "@tanstack/react-query";
import { membershipApi } from "@/lib/api";
import {
  resolveBannerVisibility,
  type BannerVisibility,
} from "@/lib/ads/adVisibility";
import { queryKeys } from "@/lib/query/keys";
import { useAuthStore } from "@/stores/authStore";

/**
 * Reklam yuvaları görünür mü: üyelik katmanının `isAdFree` kutusuna uyar
 * (kural: `resolveBannerVisibility`). Limit sorgusu yalnız giriş yapmış
 * kullanıcıda atılır; misafir hiçbir ek istek yapmaz. Sorgu verisi önbellekte
 * kalır: `checkAuth` `isLoading`'i tekrar açsa da son bilinen değer korunur.
 */
export function useBannerVisibility(): BannerVisibility {
  const { isAuthenticated, isLoading: isAuthLoading } = useAuthStore();

  const limits = useQuery({
    queryKey: queryKeys.membership.limits(),
    queryFn: async (): Promise<{ isAdFree: boolean }> => {
      const res = await membershipApi.getLimits();
      return { isAdFree: res.data?.isAdFree === true };
    },
    enabled: isAuthenticated && !isAuthLoading,
    // Katman nadiren değişir; üyelik değişince `invalidateMembershipQueries`
    // tazeler.
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  return resolveBannerVisibility({
    isAuthLoading,
    isAuthenticated,
    limitsStatus: limits.status,
    isAdFree: limits.data?.isAdFree,
  });
}
