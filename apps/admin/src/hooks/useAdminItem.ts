"use client";

import { useSuspenseQuery } from "@tanstack/react-query";
import { isNotFoundError } from "@/lib/error";
import { adminKeys } from "@/lib/query/keys";

export interface UseAdminItemOptions<T> {
  /** Resource name — must match the list's resource so invalidation hits both. */
  resource: string;
  id: string;
  /** Fetches (and unwraps) the item, e.g. `(id) => adminApi.getOrderFile(id).then(r => r.data)`. */
  fetcher: (id: string) => Promise<T>;
}

/**
 * Single-item GET for detail pages. Suspends until loaded (the surrounding
 * SuspenseBoundary shows the spinner / catches transient errors), so callers get
 * the item already resolved. API 404s become null for DetailPage's not-found
 * state instead of entering the retry boundary. Keyed with the shared
 * `[resource, 'detail', id]` convention.
 */
export function useAdminItem<T>({
  resource,
  id,
  fetcher,
}: UseAdminItemOptions<T>) {
  const query = useSuspenseQuery({
    queryKey: adminKeys.detail(resource, id),
    queryFn: async () => {
      try {
        return await fetcher(id);
      } catch (error) {
        if (isNotFoundError(error)) return null;
        throw error;
      }
    },
  });
  return {
    item: query.data as T | null,
    isFetching: query.isFetching,
    refetch: query.refetch,
  };
}
