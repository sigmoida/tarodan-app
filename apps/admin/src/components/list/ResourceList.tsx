'use client';

import { type ReactNode } from 'react';
import type { AxiosResponse } from 'axios';
import { useAdminResource } from '@/hooks/useAdminResource';
import { SuspenseBoundary } from '@/components/page/SuspenseBoundary';
import { AdminPage } from '@/components/page/AdminPage';
import { ResourceListContext, useSelection } from './context';

export interface ResourceListProps<T> {
  /** Resource name — the query key and the invalidation target. */
  resource: string;
  fetcher: (params: Record<string, any>) => Promise<AxiosResponse<any>>;
  getRowId: (row: T) => string;
  limit?: number;
  syncUrl?: boolean;
  initialFilters?: Record<string, string>;
  errorMessage?: string;
  debounceMs?: number;
  selectable?: boolean;
  children: ReactNode;
}

/**
 * Root of the list stack. Runs `useAdminResource` and exposes its state via
 * context; the sub-parts (Header/Toolbar/Search/FilterSelect/Table/Pagination/
 * BulkBar) read from context, so no state is threaded through props.
 *
 * Root props are ONLY the data config; view config (columns, placeholders)
 * lives on the sub-part that uses it.
 */
/**
 * Root. The data fetch lives in an inner component under a SuspenseBoundary, so
 * the whole list (header + toolbar + table + pagination) shows ONE spinner on
 * first load — never a misleading "0 items" header while the table spins.
 */
export function ResourceListRoot<T>({ children, ...config }: ResourceListProps<T>) {
  return (
    <SuspenseBoundary>
      <ResourceListInner {...config}>{children}</ResourceListInner>
    </SuspenseBoundary>
  );
}

function ResourceListInner<T>({
  resource,
  fetcher,
  getRowId,
  limit,
  syncUrl,
  initialFilters,
  errorMessage,
  debounceMs,
  selectable = false,
  children,
}: ResourceListProps<T>) {
  const data = useAdminResource<T>({
    queryKey: resource,
    fetcher,
    limit,
    syncUrl,
    initialFilters,
    errorMessage,
    debounceMs,
  });
  const selection = useSelection(selectable);

  return (
    <ResourceListContext.Provider value={{ ...data, getRowId, selection }}>
      <AdminPage>{children}</AdminPage>
    </ResourceListContext.Provider>
  );
}
