/** @format */

"use client";

import { useQuery } from "@tanstack/react-query";
import { membershipApi } from "@/lib/api";
import { shouldShowBanner } from "@/lib/ads/adVisibility";
import { queryKeys } from "@/lib/query/keys";
import { useAuthStore } from "@/stores/authStore";

/**
 * Banner yuvaları çizilsin mi: üyelik katmanının `isAdFree` kutusuna uyar
 * (kural: `shouldShowBanner`). Limit sorgusu yalnız giriş yapmış kullanıcıda
 * atılır; misafir hiçbir ek istek yapmaz.
 */
export function useBannerVisibility(): boolean {
  const { isAuthenticated, isLoading: isAuthLoading } = useAuthStore();

  const limits = useQuery({
    queryKey: queryKeys.membership.limits(),
    queryFn: async (): Promise<{ isAdFree: boolean }> => {
      const res = await membershipApi.getLimits();
      return { isAdFree: res.data?.isAdFree === true };
    },
    enabled: isAuthenticated && !isAuthLoading,
    // Katman nadiren değişir; her sayfa geçişinde yeniden sormak gereksiz yük.
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  return shouldShowBanner({
    isAuthLoading,
    isAuthenticated,
    limitsStatus: limits.status,
    isAdFree: limits.data?.isAdFree ?? false,
  });
}
