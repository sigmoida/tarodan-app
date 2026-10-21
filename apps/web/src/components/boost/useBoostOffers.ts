"use client";

import { useQuery } from "@tanstack/react-query";
import { boostApi } from "@/lib/api";
import { queryKeys } from "@/lib/query/keys";
import { useAuthStore } from "@/stores/authStore";

const OFFERS_STALE_MS = 5 * 60_000;

/**
 * `GET /products/boost/offers`: the boost switch (`enabled`) and the
 * signed-in seller's listings due the one-time offer. One query per session,
 * shared by every listing card and the offer dialog; never sent for a guest.
 * `enabled: false` keeps a caller that does not need it (a card that is not
 * the viewer's own) from sending it.
 */
export function useBoostOffers({ enabled = true }: { enabled?: boolean } = {}) {
  const signedIn = useAuthStore((s) => s.isAuthenticated);
  return useQuery({
    queryKey: queryKeys.boost.offers(),
    queryFn: async () => (await boostApi.offers()).data,
    enabled: signedIn && enabled,
    staleTime: OFFERS_STALE_MS,
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
