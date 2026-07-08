/** @format */

"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { useAuthStore } from "@/stores/authStore";
import { tradesApi } from "@/lib/api";
import { useTranslation } from "@/i18n";
import type { Trade } from "../_lib/types";

/**
 * Owns the trade `useQuery`, the auth guard, the load-error redirect, the
 * `isLoading` derivation, and the `invalidateTrade` helper. Returns the raw
 * trade plus the primitives the rest of the screen builds on.
 */
export function useTradeQuery() {
  const params = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { isAuthenticated, isLoading: authLoading } = useAuthStore();
  const { locale } = useTranslation();
  const tradeId = params.id as string;

  useEffect(() => {
    if (authLoading) return;
    if (!isAuthenticated) {
      toast.error(
        locale === "en"
          ? "Please login to view trade details"
          : "Takas detaylarını görmek için giriş yapmalısınız",
      );
      router.push(`/login?redirect=/profile/trades/${tradeId}`);
    }
  }, [isAuthenticated, authLoading, locale, router, tradeId]);

  const tradeQuery = useQuery({
    queryKey: ["trade", tradeId],
    queryFn: async (): Promise<Trade> => {
      const response = await tradesApi.getOne(tradeId);
      return response.data.trade || response.data;
    },
    enabled: !!tradeId && !authLoading && isAuthenticated,
    meta: { page: "trade-detail" },
    retry: false,
  });
  const trade = tradeQuery.data ?? null;
  const isLoading =
    authLoading ||
    tradeQuery.isLoading ||
    tradeQuery.isFetching ||
    (!!tradeId && isAuthenticated && tradeQuery.isPending);

  useEffect(() => {
    if (tradeQuery.isError && tradeId) {
      toast.error(
        locale === "en" ? "Failed to load trade" : "Takas yüklenemedi",
      );
      router.push("/profile/trades");
    }
  }, [tradeQuery.isError, tradeId, locale, router]);

  const invalidateTrade = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ["trade", tradeId] }),
      queryClient.invalidateQueries({ queryKey: ["trades"] }),
    ]);

  return { trade, isLoading, invalidateTrade, tradeId };
}
