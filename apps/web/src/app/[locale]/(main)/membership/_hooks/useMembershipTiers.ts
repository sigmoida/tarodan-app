/** @format */

"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { membershipApi } from "@/lib/api";
import { queryKeys } from "@/lib/query/keys";
import { normalizeTierData } from "../_lib/tiers";
import type { TierData } from "../_lib/types";

/**
 * Membership tier prices + limits. The raw payload is prefetched on the server
 * (dehydrated into the page), so this reads from cache on first paint — no flash
 * — and is public (no auth needed).
 */
export function useMembershipTiers(): TierData {
  const query = useQuery({
    queryKey: queryKeys.membership.tiers(),
    queryFn: async () => (await membershipApi.getTiers()).data,
    staleTime: 5 * 60 * 1000,
  });
  return useMemo(() => normalizeTierData(query.data), [query.data]);
}
