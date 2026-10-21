"use client";

import {
  useInfiniteQuery,
  type InfiniteData,
  useQuery,
  type UseInfiniteQueryOptions,
  type UseQueryOptions,
} from "@tanstack/react-query";
import { nextPageParam, type PagedResult } from "@/lib/pagedList";
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

export interface UseWebInfiniteListOptions<T> {
  /** Resource name; the key is `webKeys.infinite(resource, params)`. */
  resource: string;
  /** Key discriminators (user, filters). The page is NOT part of the key: one entry holds every loaded page. */
  params?: unknown;
  /** Fetches one page (1-based) and returns it as a `PagedResult`. */
  fetchPage: (page: number) => Promise<PagedResult<T>>;
  enabled?: boolean;
  query?: Omit<
    UseInfiniteQueryOptions<
      PagedResult<T>,
      Error,
      InfiniteData<PagedResult<T>, number>,
      readonly unknown[],
      number
    >,
    | "queryKey"
    | "queryFn"
    | "enabled"
    | "initialPageParam"
    | "getNextPageParam"
    | "select"
  >;
}

/** Paged "Show more" list over `useInfiniteQuery`, under a web resource key. */
export function useWebInfiniteList<T>({
  resource,
  params,
  fetchPage,
  enabled = true,
  query,
}: UseWebInfiniteListOptions<T>) {
  return useInfiniteQuery({
    ...query,
    queryKey: webKeys.infinite(resource, params),
    queryFn: ({ pageParam }) => fetchPage(pageParam),
    initialPageParam: 1,
    getNextPageParam: nextPageParam,
    enabled,
  });
}
