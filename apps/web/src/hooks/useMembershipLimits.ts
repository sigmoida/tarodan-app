/** @format */

"use client";

import { useQuery } from "@tanstack/react-query";
import { membershipApi } from "@/lib/api";
import { queryKeys } from "@/lib/query/keys";

/**
 * The fields of `GET /membership/me/limits` the web reads. They are the
 * effective tier's values: a past-due paid member reads the free tier's.
 */
export interface MembershipLimits {
  isAdFree?: boolean;
  /** Most saved searches the tier allows; 0 is a valid limit. */
  maxSavedSearches?: number;
}

/** The whole limits body, as cached under `queryKeys.membership.limits()`. */
export async function fetchMembershipLimits(): Promise<MembershipLimits> {
  return ((await membershipApi.getLimits()).data ?? {}) as MembershipLimits;
}

/**
 * The membership limits: ONE query (key, fetcher and freshness) for every
 * consumer, each picking its field with `select`, so the banner rule and the
 * saved-search limit never read two copies of the same body.
 * `invalidateMembershipQueries` refreshes it after a membership change, and
 * `useMembershipSettle` writes the body it polls straight into it.
 */
export function useMembershipLimits<T>(
  select: (limits: MembershipLimits) => T,
  { enabled }: { enabled: boolean },
) {
  return useQuery({
    queryKey: queryKeys.membership.limits(),
    queryFn: fetchMembershipLimits,
    select,
    enabled,
    // One retry policy for every consumer: the banner rule must settle fast
    // (a failure shows the ads), whichever observer starts the fetch.
    retry: false,
    // Tiers change rarely; a membership change invalidates the entry.
    staleTime: 5 * 60 * 1000,
  });
}
