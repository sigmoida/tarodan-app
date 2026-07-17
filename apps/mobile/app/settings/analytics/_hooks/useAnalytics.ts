import { useCallback } from "react";
import { useFocusEffect } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useRefresh } from "@/hooks/useRefresh";
import { useAuthStore } from "@/stores/authStore";
import { useTranslation } from "react-i18next";
import type { Analytics } from "../_lib/types";

/**
 * Analytics controller — owns the seller-analytics query, focus refresh, and the
 * premium/auth flags. Lifted verbatim from the monolithic AnalyticsScreen.
 */
export function useAnalytics() {
  const { t } = useTranslation();
  const { isAuthenticated, limits } = useAuthStore();
  const timeRange = "7d";

  const isPremium = limits?.maxListings === -1;

  // Fetch analytics
  const {
    data: analyticsData,
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ["analytics", timeRange],
    queryFn: async () => {
      const response = await api.get("/users/me/analytics", {
        params: { period: timeRange },
      });
      return response.data;
    },
    enabled: isAuthenticated,
  });

  const analytics: Analytics | null = analyticsData || null;

  const { refreshing, onRefresh } = useRefresh(refetch);

  // Refresh on focus
  useFocusEffect(
    useCallback(() => {
      if (isAuthenticated) {
        refetch();
      }
    }, [isAuthenticated]),
  );

  return {
    t,
    isAuthenticated,
    isPremium,
    isLoading,
    analytics,
    refreshing,
    onRefresh,
  };
}

export type AnalyticsController = ReturnType<typeof useAnalytics>;
