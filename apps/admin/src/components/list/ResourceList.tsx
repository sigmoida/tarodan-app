"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import type { AxiosResponse } from "axios";
import { Spinner } from "@tarodan/ui";
import { useAdminResource } from "@/hooks/useAdminResource";
import { SuspenseBoundary } from "@/components/page/SuspenseBoundary";
import { AdminPage } from "@/components/page/AdminPage";
import {
  ResourceListContext,
  useSelection,
} from "@/context/ResourceListContext";
import { filterDefaults } from "@/components/list/filters/schema";
import type { FilterField } from "@/components/list/filters/types";

/** Stable identity so the default doesn't churn the context value each render. */
const EMPTY_FIELDS: readonly FilterField[] = [];

export interface ResourceListProps<T> {
  /** Resource name — the query key and the invalidation target. */
  resource: string;
  fetcher: (params: Record<string, any>) => Promise<AxiosResponse<any>>;
  getRowId: (row: T) => string;
  limit?: number;
  syncUrl?: boolean;
  /**
   * The list's filter schema. The toolbar renders it as a dialog, and the
   * defaults it declares become part of `initialFilters` — so a filter can
   * never exist in the UI without its URL param being registered.
   */
  filters?: readonly FilterField[];
  /**
   * Filter keys with NO control of their own — deep-link-only params such as
   * orders' `userId`/`productId` or products' `sellerId`. Merged over (and so
   * able to override) the schema defaults.
   */
  initialFilters?: Record<string, string>;
  debounceMs?: number;
  /** #101: full-load (client-list) kaynakları için staleTime (ms) — mount'ta tekrar indirmeyi keser. */
  staleTime?: number;
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
export function ResourceListRoot<T>({
  children,
  ...config
}: ResourceListProps<T>) {
  return (
    <SuspenseBoundary>
      <HydratedResourceList {...config}>{children}</HydratedResourceList>
    </SuspenseBoundary>
  );
}

/**
 * Admin data calls use the browser-only same-origin `/gateway` BFF so its
 * httpOnly session can be attached server-side. Client Components are still
 * pre-rendered by Next.js; starting a relative gateway request during that
 * pass makes Axios fail before hydration. Keep the server and first browser
 * render on the same loading snapshot, then start the query after hydration.
 */
function HydratedResourceList<T>(props: ResourceListProps<T>) {
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => setHydrated(true), []);

  if (!hydrated) {
    return (
      <div className="flex items-center justify-center py-16" aria-busy="true">
        <Spinner size="lg" />
      </div>
    );
  }

  return <ResourceListInner {...props} />;
}

function ResourceListInner<T>({
  resource,
  fetcher,
  getRowId,
  limit,
  syncUrl,
  filters = EMPTY_FIELDS,
  initialFilters,
  debounceMs,
  staleTime,
  selectable = false,
  children,
}: ResourceListProps<T>) {
  // The schema's defaults ARE the filter baseline. They are handed to the hook,
  // which latches them at mount; everything downstream then reads the latched
  // copy (`data.baseFilters`) rather than this per-render derivation, so the
  // badge, the dialog's reset and the URL's clean-value test cannot drift apart
  // if a schema's options arrive asynchronously.
  const data = useAdminResource<T>({
    queryKey: resource,
    fetcher,
    staleTime,
    limit,
    syncUrl,
    initialFilters: { ...filterDefaults(filters), ...initialFilters },
    debounceMs,
  });
  const selection = useSelection(selectable);
  const exportRef = useRef<any[]>([]);
  const exportRowsRef = useRef<any[]>([]);

  return (
    <ResourceListContext.Provider
      value={{
        ...data,
        getRowId,
        filterFields: filters,
        selection,
        exportRef,
        exportRowsRef,
        exportName: resource,
      }}
    >
      <AdminPage>{children}</AdminPage>
    </ResourceListContext.Provider>
  );
}
