/** @format */

"use client";

import { useRouter } from "@/i18n/navigation";
import { useMutation } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { api, listingsApi, userApi } from "@/lib/api";
import { useWebList } from "@/hooks/useWebResource";
import { queryKeys } from "@/lib/query/keys";
import { useAuthStore } from "@/stores/authStore";
import { useTranslations } from "next-intl";
import type { TradeProduct } from "../_lib/types";

/** The listing the user wants (target of the trade). */
export function useTradeTarget(listingId: string | null, enabled: boolean) {
  const query = useWebList<TradeProduct>({
    resource: "trade-target",
    params: listingId,
    fetcher: async () => {
      const res = await listingsApi.getOne(listingId!);
      return res.data.product || res.data;
    },
    enabled: enabled && !!listingId,
    query: { meta: { page: "trades-new-target" } },
  });
  return { target: query.data ?? null, isLoading: query.isLoading };
}

/**
 * The user's active, trade-enabled products (excluding the target).
 *
 * Always fresh on open (`staleTime: 0`, `refetchOnMount: "always"`) so a listing
 * created, edited or approved since the last visit shows up. The key carries the
 * user id so a user switch can never serve another user's list. `isLoading` is
 * true while fetching with nothing cached, so the empty state never flashes
 * during a refetch.
 */
export function useTradeableProducts(
  listingId: string | null,
  enabled: boolean,
) {
  const userId = useAuthStore((s) => s.user?.id);
  const query = useWebList<TradeProduct[]>({
    resource: queryKeys.tradeEligible.resource,
    params: { userId, listingId },
    fetcher: async () => {
      const res = await userApi.getMyProducts({
        status: "active",
        tradeEligible: true,
      });
      const products: TradeProduct[] = res.data.data || res.data.products || [];
      return products.filter(
        (p) => p.status === "active" && p.isTradeEnabled && p.id !== listingId,
      );
    },
    enabled: enabled && !!listingId && !!userId,
    query: {
      staleTime: 0,
      refetchOnMount: "always",
      meta: { page: "trades-new-products" },
    },
  });
  const products = query.data ?? [];
  return {
    products,
    isLoading: query.isLoading || (query.isFetching && products.length === 0),
  };
}

export interface CreateTradePayload {
  receiverId: string;
  initiatorItems: { productId: string; quantity: number }[];
  receiverItems: { productId: string; quantity: number }[];
  cashAmount?: number;
  message?: string;
  shippingAddressId?: string;
}

/** Send a trade offer → navigate to the trades list. */
export function useCreateTrade() {
  const router = useRouter();
  const t = useTranslations();
  const refreshUserData = useAuthStore((s) => s.refreshUserData);

  return useMutation({
    mutationFn: (payload: CreateTradePayload) => api.post("/trades", payload),
    onSuccess: () => {
      toast.success(t("trade.tradeSent"));
      router.push("/profile/trades");
    },
    onError: async (error: any) => {
      const msg =
        error?.response?.data?.message ||
        error?.message ||
        t("trade.sendFailed");
      if (
        // The API returns this text as fixed Turkish (membership.service.ts); the
        // match must mirror the server copy exactly, not the UI translation.
        /* eslint-disable @tarodan/no-hardcoded-turkish */
        msg.includes("Takas özelliği") ||
        msg.includes("üyeliğinizde mevcut değil") ||
        msg.includes("takas özelliğine sahip değil")
        /* eslint-enable @tarodan/no-hardcoded-turkish */
      ) {
        await refreshUserData();
      }
      toast.error(msg);
    },
  });
}
