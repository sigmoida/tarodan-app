"use client";

import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { BoostOffersResponse } from "@tarodan/types";
import { boostApi } from "@/lib/api";
import { queryKeys } from "@/lib/query/keys";
import { useWebMutation } from "@/hooks/useWebMutation";
import { useAuthStore } from "@/stores/authStore";

const OFFERS_STALE_MS = 5 * 60_000;

/**
 * `GET /products/boost/offers`: the boost switch (`enabled`) and the
 * signed-in seller's listings due the one-time offer. One query shared by
 * every listing card and the offer dialog; never sent for a guest. The cards
 * keep a five-minute window; `live` (the offer dialog host only) makes that
 * observer refetch on mount and on every window focus, and the host also
 * refetches on each route change, so the request repeats while a seller
 * browses.
 * `enabled: false` keeps a caller that does not need it (a card that is not
 * the viewer's own) from sending it.
 */
export function useBoostOffers({
  enabled = true,
  live = false,
}: { enabled?: boolean; live?: boolean } = {}) {
  const signedIn = useAuthStore((s) => s.isAuthenticated);
  return useQuery({
    queryKey: queryKeys.boost.offers(),
    queryFn: async () => (await boostApi.offers()).data,
    enabled: signedIn && enabled,
    // The offer dialog (`live`) asks again on every window focus, and on
    // every page it mounts on: realtime is dormant, so this is how an
    // approval reaches the seller. The shared observers keep the long window.
    staleTime: live ? 0 : OFFERS_STALE_MS,
    refetchOnWindowFocus: live,
    meta: { page: "boost-offers" },
  });
}

/**
 * Whether the viewer can buy a boost now (boost sales on). Until the answer
 * arrives this is true, the same default as the setting itself (missing =
 * on, `isBoostEnabled`), so an own listing shows its boost action without a
 * flicker; the dialog shows `profile.boost.unavailable` if sales turn out to
 * be off. A failed request also keeps it on: hiding the seller's boost
 * entry on a transient error would be worse, and the dialog (and the API)
 * still refuse a purchase while sales are off.
 */
export function useBoostEnabled({
  enabled = true,
}: { enabled?: boolean } = {}): boolean {
  const { data } = useBoostOffers({ enabled });
  return data ? data.enabled : true;
}

/**
 * Dismisses the offers a dialog listed. The cache drops them at once (so
 * the dialog closes and does not come back on a refetch that races the
 * request); a failed request is silent and not retried (the host keeps its
 * own session list of dismissed ids, so a refetch cannot reopen them).
 */
export function useDismissBoostOffers() {
  const queryClient = useQueryClient();
  const mutation = useWebMutation(
    (productIds: string[]) => boostApi.dismissOffers({ productIds }),
    { silentError: true },
  );
  const { mutate } = mutation;
  return useCallback(
    (productIds: string[]) => {
      if (productIds.length === 0) return;
      const gone = new Set(productIds);
      queryClient.setQueryData<BoostOffersResponse>(
        queryKeys.boost.offers(),
        (old) =>
          old && {
            ...old,
            offers: old.offers.filter((o) => !gone.has(o.productId)),
          },
      );
      mutate(productIds);
    },
    [queryClient, mutate],
  );
}
