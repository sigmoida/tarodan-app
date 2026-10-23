"use client";

import { useQuery } from "@tanstack/react-query";
import { listingsApi } from "@/lib/api";
import { queryKeys } from "@/lib/query/keys";
import { unwrapList } from "@/lib/unwrapList";
import type { Product } from "@/types/product";
import {
  HOME_RAIL_QUERIES,
  POPULAR_PATH,
  railItems,
  type HomeRail,
  type HomeRailSeed,
} from "../lib/rails";

/** The same list the server asks for (`HOME_RAIL_QUERIES`), via the browser client. */
export async function fetchHomeRailClient(rail: HomeRail): Promise<Product[]> {
  const { path, params } = HOME_RAIL_QUERIES[rail];
  const res =
    path === POPULAR_PATH
      ? await listingsApi.getPopular(params)
      : await listingsApi.getAll(params);
  return railItems(rail, unwrapList<Product>(res.data));
}

/**
 * A home rail's first page. A server seed is used as is; a `null` seed (the
 * server fetch failed) loads the rail in the browser. Returns `null` while it
 * loads or when it never loaded, so the caller keeps the rail hidden rather
 * than calling it empty.
 */
export function useHomeRail(rail: HomeRail, seed: HomeRailSeed): HomeRailSeed {
  const query = useQuery({
    queryKey: queryKeys.home[rail](),
    queryFn: () => fetchHomeRailClient(rail),
    enabled: seed === null,
    // The gate and the cards read this query; one fetch serves both.
    staleTime: 60_000,
  });
  if (seed !== null) return seed;
  // A failed refetch keeps the last loaded data (React Query keeps `data`).
  return query.data ?? null;
}
