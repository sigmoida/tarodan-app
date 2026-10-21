/** @format */

"use client";

import { useQuery } from "@tanstack/react-query";
import { membershipApi } from "@/lib/api";
import { queryKeys } from "@/lib/query/keys";
import { unwrapList } from "@/lib/unwrapList";

/** The Premium tier's `maxSavedSearches` from the public tier list, if any. */
function selectPremiumLimit(raw: unknown): number | null {
  const premium = unwrapList<{ type?: unknown; maxSavedSearches?: unknown }>(
    raw,
  ).find((tier) => tier?.type === "premium");
  return typeof premium?.maxSavedSearches === "number"
    ? premium.maxSavedSearches
    : null;
}

/**
 * Whether to show the "Save more searches with Premium" link next to a
 * reached saved-search `limit` (web only, ADR 0003). The copy names Premium,
 * so the link shows only when the Premium tier allows more than `limit`:
 * never to a Premium or Business member, and not while every tier has the
 * same limit. Read from the tier rows, not a tier ladder.
 */
export function useSavedSearchUpgrade(limit: number | null): boolean {
  const premiumLimit = useQuery({
    // The raw body, as the membership page seeds and reads this key.
    queryKey: queryKeys.membership.tiers(),
    queryFn: async () => (await membershipApi.getTiers()).data,
    select: selectPremiumLimit,
    enabled: limit !== null,
    staleTime: 5 * 60 * 1000,
  }).data;
  return (
    limit !== null && typeof premiumLimit === "number" && premiumLimit > limit
  );
}
