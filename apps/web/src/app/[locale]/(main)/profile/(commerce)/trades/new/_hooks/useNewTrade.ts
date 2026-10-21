/** @format */

"use client";

import { useRouter } from "@/i18n/navigation";
import { useMutation } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { api, listingsApi, userApi } from "@/lib/api";
import { useWebInfiniteList, useWebList } from "@/hooks/useWebResource";
import { flattenPages, toPagedResult } from "@/lib/pagedList";
import {
  TRADE_PICKER_PAGE_SIZE,
  TRADE_PICKER_QUERY_OPTIONS,
} from "@/lib/query/tradePicker";
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
    query: {
      ...TRADE_PICKER_QUERY_OPTIONS,
      meta: { page: "trades-new-target" },
    },
  });
  return { target: query.data ?? null, isLoading: query.isLoading };
}

/**
 * The user's active, trade-enabled products (excluding the target), paged: the
 * server filters (`tradeOnly`, `tradeEligible`) so every page is full and
 * `meta.totalPages` counts only eligible rows; "Show more" loads the next page.
 * The only client filter is the target exclusion (at most one row).
 *
 * Fresh on open and on tab focus (`TRADE_PICKER_QUERY_OPTIONS`) so a listing
 * created, edited or approved since the last visit shows up; a refetch reloads
 * every loaded page. The key carries the user id so a user switch can never
 * serve another user's list (the logout cache clear does not cover a same-tab
 * account switch). The page number is the infinite query's page param, not part
 * of the key.
 *
 * `isLoading` wins over the empty state until this page's own fetch settles:
 * react-query's `isLoading` covers only the very first fetch, so a cached empty
 * list refetched on open must read as loading too. Once a fetch settled after
 * mount (`isFetchedAfterMount`, also true after an error), later background
 * refetches (tab focus, invalidation) keep the settled state on screen instead
 * of flashing a spinner, and a failed fetch never spins forever.
 */
export function useTradeableProducts(
  listingId: string | null,
  enabled: boolean,
) {
  const userId = useAuthStore((s) => s.user?.id);
  const query = useWebInfiniteList<TradeProduct>({
    resource: queryKeys.tradeEligible.resource,
    params: { userId, listingId },
    fetchPage: async (page) => {
      const res = await userApi.getMyProducts({
        status: "active",
        tradeEligible: true,
        tradeOnly: true,
        page,
        limit: TRADE_PICKER_PAGE_SIZE,
      });
      return toPagedResult<TradeProduct>(res.data, page);
    },
    enabled: enabled && !!listingId && !!userId,
    query: {
      ...TRADE_PICKER_QUERY_OPTIONS,
      meta: { page: "trades-new-products" },
    },
  });
  const products = flattenPages(query.data?.pages).filter(
    (p) => p.id !== listingId,
  );
  return {
    products,
    isLoading:
      query.isLoading ||
      (query.isFetching && !query.isFetchedAfterMount && products.length === 0),
    hasMore: !!query.hasNextPage,
    isLoadingMore: query.isFetchingNextPage,
    loadMore: () => {
      void query.fetchNextPage();
    },
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
