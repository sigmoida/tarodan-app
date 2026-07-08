'use client';

import { useSuspenseQuery } from '@tanstack/react-query';
import { adminKeys } from '@/lib/query/keys';

export interface UseAdminItemOptions<T> {
  /** Resource name — must match the list's resource so invalidation hits both. */
  resource: string;
  id: string;
  /** Fetches (and unwraps) the item, e.g. `(id) => adminApi.getOrder(id).then(r => r.data)`. */
  fetcher: (id: string) => Promise<T>;
}

/**
 * Single-item GET for detail pages. Suspends until loaded (the surrounding
 * SuspenseBoundary shows the spinner / catches errors), so callers get the item
 * already resolved. Keyed with the shared `[resource, 'detail', id]` convention.
 */
export function useAdminItem<T>({ resource, id, fetcher }: UseAdminItemOptions<T>) {
  const query = useSuspenseQuery({
    queryKey: adminKeys.detail(resource, id),
    queryFn: () => fetcher(id),
  });
  return {
    item: query.data as T,
    isFetching: query.isFetching,
    refetch: query.refetch,
  };
}
