"use client";

import { useQuery, type UseQueryOptions } from "@tanstack/react-query";
import { webKeys } from "@/lib/query/keys";

/**
 * Light list/detail query hooks — the web analogues of admin's
 * `useAdminResource` / `useAdminItem`, but plain `useQuery` (web is not
 * suspense-based). They own the resource-prefixed key convention (`webKeys`) so
 * a `useWebMutation({ invalidates: [resource] })` refreshes them automatically.
 *
 * The `fetcher` returns the ALREADY-UNWRAPPED data (web's `*Api` methods return
 * an axios response whose payload shape varies — `res.data`, `res.data.data`, … —
 * so the caller unwraps). These cover the SIMPLE account-area lists/details;
 * public SSR-prefetched grids keep their bespoke `queryKeys`-keyed hooks so their
 * keys still match the server seed.
 */

export interface UseWebListOptions<T> {
  /** Resource name, e.g. "profile-addresses". Keyed as [resource, 'list', params?]. */
  resource: string;
  /** Returns the unwrapped list data. */
  fetcher: () => Promise<T>;
  /** Extra key discriminators (filter/tab). Part of the cache key. */
  params?: unknown;
  enabled?: boolean;
  query?: Omit<UseQueryOptions<T>, "queryKey" | "queryFn" | "enabled">;
}

export function useWebList<T>({
  resource,
  fetcher,
  params,
  enabled = true,
  query,
}: UseWebListOptions<T>) {
  return useQuery<T>({
    ...query,
    queryKey: webKeys.list(resource, params),
    queryFn: fetcher,
    enabled,
  });
}

export interface UseWebItemOptions<T> {
  /** Resource name — MUST match the list's resource so invalidation hits both. */
  resource: string;
  id: string;
  /** Returns the unwrapped item data for `id`. */
  fetcher: (id: string) => Promise<T>;
  enabled?: boolean;
  query?: Omit<UseQueryOptions<T>, "queryKey" | "queryFn" | "enabled">;
}

export function useWebItem<T>({
  resource,
  id,
  fetcher,
  enabled,
  query,
}: UseWebItemOptions<T>) {
  return useQuery<T>({
    ...query,
    queryKey: webKeys.detail(resource, id),
    queryFn: () => fetcher(id),
    enabled: enabled ?? !!id,
  });
}
