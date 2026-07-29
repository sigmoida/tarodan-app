"use client";

import { useState, useCallback, useEffect, useRef, useTransition } from "react";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import type { AxiosResponse } from "axios";
import { adminKeys } from "@/lib/query/keys";
import { normalizePageSize } from "@/components/list/page-size";
import {
  CLIENT_LIST_STALE_MS,
  type ClientListFetcher,
} from "@/lib/query/client-list";
import {
  type SetSort,
  type SortState,
  type SortType,
} from "@/components/table/meta";

const SORT_TYPES: readonly SortType[] = ["text", "number", "date"];

function normalizeSortType(value: string | null): SortType | undefined {
  return SORT_TYPES.includes(value as SortType)
    ? (value as SortType)
    : undefined;
}

// ─── Types ───────────────────────────────────────────────────────────────

export interface UseAdminResourceOptions<T> {
  /** react-query cache key — unique resource name, e.g. "trades" */
  queryKey: string;
  /**
   * Data-fetching function. Params: { page, limit, search?, ...initialFilters keys }
   * We expect the Axios response returned by AdminApi methods.
   */
  fetcher: (params: Record<string, any>) => Promise<AxiosResponse<any>>;
  /** Records per page. Default: 20 */
  limit?: number;
  /**
   * When true, ?page=&q=&<filter-keys>= is reflected to the URL and read back
   * on page load. Enables deep-linking and back-button support.
   */
  syncUrl?: boolean;
  /** Initial filter values (excluding search). E.g. { status: "all", userId: "" } */
  initialFilters?: Record<string, string>;
  /**
   * Search debounce duration (ms). Default: 300.
   * If 0, runs immediately without debounce.
   * On setSearch the input updates INSTANTLY; the query fires after this delay.
   * Enter (onSearchSubmit) still works, skipping the debounce for an instant flush.
   */
  debounceMs?: number;
  /**
   * react-query staleTime (ms). #101: full-load (client-list) kaynakları için ver
   * (örn 5dk) → detail→list dönüşünde `refetchOnMount:'always'`'in tüm tabloyu tekrar
   * indirmesini keser. Default 0 → server-paginated kaynaklar her dönüşte taze kalır.
   */
  staleTime?: number;
}

export interface UseAdminResourceResult<T> {
  /** Rows of the current page */
  rows: T[];
  /** Total record count (from backend meta) */
  total: number;
  /** Current page number (1-based) */
  page: number;
  setPage: (p: number) => void;
  /** Number of records requested per page (stateful — the page-size selector). */
  pageSize: number;
  /** Change the page size ("Show 20/50/100/250"); resets to page 1 and URL-syncs. */
  setPageSize: (size: number) => void;
  /** Total page count */
  totalPages: number;
  /** Search box value (for the controlled input) */
  search: string;
  /**
   * Updates the search box; the input updates INSTANTLY (no lag).
   * After debounceMs the search auto-commits → query + page reset.
   * Returning to an empty value also triggers a fetch.
   */
  setSearch: (v: string) => void;
  /** Enter/search button: skips the debounce for an instant flush and resets page to 1 */
  onSearchSubmit: () => void;
  /** Map of filter values */
  filters: Record<string, string>;
  /** Updates a single filter key and resets the page */
  setFilter: (key: string, value: string) => void;
  /** Active sort ({ sortBy?, sortOrder, sortType? }); empty sortBy = unsorted. */
  sort: SortState;
  /** Toggle sort on a column (asc → desc → off) and reset the page to 1. */
  setSort: SetSort;
  /** Data is loading (initial load or refetch) */
  isLoading: boolean;
  /** Raw backend response (not extracted) — for extra fields like meta/stats. */
  data: any;
  /** Manually triggers react-query refetch */
  refetch: () => void;
  /**
   * Tab URL sync: updates the "tab" param while preserving current search/filter params.
   * Only active when syncUrl=true. The page always resets to 1.
   * @param key - New tab value
   * @param opts.defaultTab - Default tab; not written to the URL (clean URL). Default: ""
   * @param opts.resetFilters - When true, filters reset to initialFilters. Default: false
   * @param opts.resetSearch - When true, the search box is cleared. Default: false
   */
  setTabUrl: (
    key: string,
    opts?: {
      defaultTab?: string;
      resetFilters?: boolean;
      resetSearch?: boolean;
    },
  ) => void;
}

// ─── Helper: extract data and total from the backend response ──────────────

function extractData<T>(
  responseData: any,
  queryKey: string,
): { rows: T[]; total: number } {
  // Possible payload shapes (defensive access against backend inconsistency):
  //   { data: [...], meta: { total } }         — getTrades, getOrders, getProducts
  //   { [queryKey]: [...], meta: { total } }   — { users: [...] }
  //   { data: { data: [...], meta } }          — nested wrapping
  //   { items: [...], total }                  — some endpoints
  //   { data: [], total, page, ... }           — top-level total (empty-search branch)
  const root = responseData ?? {};
  const nested = root.data;

  // rows: pick the first array candidate (flat or nested).
  const rows: T[] =
    [
      root.data,
      root[queryKey],
      root.items,
      nested?.data,
      nested?.[queryKey],
      nested?.items,
      Array.isArray(root) ? root : undefined,
    ].find(Array.isArray) ?? [];

  // total: meta.total → top-level total → nested total → fallback rows.length.
  // IMPORTANT: in { data: [...], meta } the meta is a SIBLING of the data array,
  // so we read meta from root (without reducing the payload to the array).
  // Otherwise total falls back to rows.length (= page size) and paginated lists
  // show a wrong total.
  const meta = root.meta ?? nested?.meta ?? {};
  const total: number =
    meta.total ?? root.total ?? nested?.total ?? rows.length;

  return { rows, total };
}

// ─── Hook ──────────────────────────────────────────────────────────────────

/**
 * Shared data-state management for admin list pages.
 * fetch + pagination + search + filters + URL sync on top of react-query.
 *
 * Usage:
 * ```ts
 * const { rows, total, page, setPage, totalPages, search, setSearch,
 *         onSearchSubmit, filters, setFilter, isLoading, refetch } =
 *   useAdminResource<Trade>({
 *     queryKey: "trades",
 *     fetcher: (params) => adminApi.getTrades(params),
 *     limit: 20,
 *     syncUrl: true,
 *     initialFilters: { status: "all" },
 *     debounceMs: 300, // default; smooth search
 *   });
 * ```
 */
export function useAdminResource<T>({
  queryKey,
  fetcher,
  limit = 20,
  syncUrl = false,
  initialFilters = {},
  debounceMs = 300,
  staleTime = 0,
}: UseAdminResourceOptions<T>): UseAdminResourceResult<T> {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  // ref for always accessing the latest searchParams; keeps syncToUrl deps lean.
  const searchParamsRef = useRef(searchParams);
  useEffect(() => {
    searchParamsRef.current = searchParams;
  }, [searchParams]);

  // ── Read initial values from the URL (syncUrl) ────────────────────────────
  const getInitialPage = () => {
    if (!syncUrl) return 1;
    const p = parseInt(searchParams.get("page") ?? "1", 10);
    return isNaN(p) || p < 1 ? 1 : p;
  };
  const getInitialSearch = () => {
    if (!syncUrl) return "";
    return searchParams.get("q") ?? "";
  };
  // Page size mirrors page/q: read from ?size= on load, else the `limit` default.
  const getInitialLimit = () => {
    if (!syncUrl) return limit;
    const s = parseInt(searchParams.get("size") ?? "", 10);
    return normalizePageSize(s, limit);
  };
  const getInitialFilters = () => {
    if (!syncUrl) return { ...initialFilters };
    const merged = { ...initialFilters };
    Object.keys(initialFilters).forEach((key) => {
      const urlVal = searchParams.get(key);
      if (urlVal !== null) merged[key] = urlVal;
    });
    return merged;
  };
  // Sort mirrors page/q/filter: read from ?sort=&dir=&sortType= on load.
  const getInitialSort = (): SortState => {
    if (!syncUrl) return { sortOrder: "asc" };
    const sortBy = searchParams.get("sort") ?? undefined;
    const dir = searchParams.get("dir") === "desc" ? "desc" : "asc";
    const sortType = normalizeSortType(searchParams.get("sortType"));
    return sortBy ? { sortBy, sortOrder: dir, sortType } : { sortOrder: "asc" };
  };

  // ── State ─────────────────────────────────────────────────────────────────
  const [page, setPageState] = useState<number>(getInitialPage);
  const [pageSize, setPageSizeState] = useState<number>(getInitialLimit);
  // inputSearch = input value (instant, controlled)
  // committedSearch = committed after debounce/Enter; the query runs against this
  const [inputSearch, setInputSearch] = useState<string>(getInitialSearch);
  const [committedSearch, setCommittedSearch] =
    useState<string>(getInitialSearch);
  const [filters, setFiltersState] =
    useState<Record<string, string>>(getInitialFilters);
  const [sort, setSortState] = useState<SortState>(getInitialSort);

  // EVERY update that changes the query key (page/committedSearch/filters) runs
  // inside a React transition, so useSuspenseQuery does NOT suspend again after
  // the initial load — the old list stays visible while isPending dims the table.
  const [isPending, startTransition] = useTransition();

  // debounce timer ref
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── URL sync (write) ──────────────────────────────────────────────────────
  const syncToUrl = useCallback(
    (
      p: number,
      q: string,
      f: Record<string, string>,
      s: SortState,
      size: number,
    ) => {
      if (!syncUrl) return;
      // Start from the current URL → params the hook doesn't own (like "tab") are preserved.
      const params = new URLSearchParams(searchParamsRef.current.toString());
      // Reset the keys the hook owns, then rewrite them.
      params.delete("page");
      params.delete("q");
      params.delete("sort");
      params.delete("dir");
      params.delete("sortType");
      params.delete("size");
      Object.keys(initialFilters).forEach((key) => params.delete(key));
      if (p > 1) params.set("page", String(p));
      if (q) params.set("q", q);
      // Only write the size when it differs from the default (clean URL).
      if (size !== limit) params.set("size", String(size));
      Object.entries(f).forEach(([key, val]) => {
        // Don't write the initialFilters default value to the URL (clean URL)
        if (val && val !== (initialFilters[key] ?? "")) params.set(key, val);
      });
      // Sort: write the key when active; the default asc direction stays implicit.
      if (s.sortBy) {
        params.set("sort", s.sortBy);
        if (s.sortOrder === "desc") params.set("dir", "desc");
        if (s.sortType) params.set("sortType", s.sortType);
      }
      const qs = params.toString();
      const newUrl = qs ? `${pathname}?${qs}` : pathname;
      router.replace(newUrl, { scroll: false });
    },
    [syncUrl, pathname, router, initialFilters, limit],
  );

  // Catch external URL changes (e.g. when the user presses the back button).
  // Only runs when syncUrl=true; leaves other cases untouched.
  const lastUrlRef = useRef(searchParams.toString());
  useEffect(() => {
    if (!syncUrl) return;
    const current = searchParams.toString();
    if (current === lastUrlRef.current) return;
    lastUrlRef.current = current;

    const urlPage = parseInt(searchParams.get("page") ?? "1", 10);
    const urlSize = parseInt(searchParams.get("size") ?? "", 10);
    const urlQ = searchParams.get("q") ?? "";
    const newFilters = { ...initialFilters };
    Object.keys(initialFilters).forEach((key) => {
      const v = searchParams.get(key);
      if (v !== null) newFilters[key] = v;
    });
    const urlSortBy = searchParams.get("sort") ?? undefined;
    const urlSortType = normalizeSortType(searchParams.get("sortType"));
    const urlSort: SortState = urlSortBy
      ? {
          sortBy: urlSortBy,
          sortOrder: searchParams.get("dir") === "desc" ? "desc" : "asc",
          sortType: urlSortType,
        }
      : { sortOrder: "asc" };

    setInputSearch(urlQ);
    startTransition(() => {
      setPageState(isNaN(urlPage) || urlPage < 1 ? 1 : urlPage);
      setPageSizeState(normalizePageSize(urlSize, limit));
      setCommittedSearch(urlQ);
      setFiltersState(newFilters);
      setSortState(urlSort);
    });
  }, [searchParams, syncUrl, initialFilters, limit]);

  // ── Helper setters ──────────────────────────────────────────────────────────
  const setPage = useCallback(
    (p: number) => {
      startTransition(() => setPageState(p));
      syncToUrl(p, committedSearch, filters, sort, pageSize);
    },
    [committedSearch, filters, sort, pageSize, syncToUrl],
  );

  // ── Page size: "Show 20/50/100/250"; resets the page to 1 ──────────────────
  const setPageSize = useCallback(
    (size: number) => {
      const normalizedSize = normalizePageSize(size, limit);
      startTransition(() => {
        setPageSizeState(normalizedSize);
        setPageState(1);
      });
      syncToUrl(1, committedSearch, filters, sort, normalizedSize);
    },
    [committedSearch, filters, sort, limit, syncToUrl],
  );

  const setFilter = useCallback(
    (key: string, value: string) => {
      const next = { ...filters, [key]: value };
      startTransition(() => {
        setFiltersState(next);
        setPageState(1);
      });
      syncToUrl(1, committedSearch, next, sort, pageSize);
    },
    [filters, committedSearch, sort, pageSize, syncToUrl],
  );

  // ── Sort: single-column toggle asc → desc → off; resets the page to 1 ────────
  const setSort = useCallback<SetSort>(
    (sortKey, sortType) => {
      const next: SortState =
        sort.sortBy !== sortKey
          ? { sortBy: sortKey, sortOrder: "asc", sortType }
          : sort.sortOrder === "asc"
            ? { sortBy: sortKey, sortOrder: "desc", sortType }
            : // was desc → clear back to unsorted
              { sortOrder: "asc" };
      startTransition(() => {
        setSortState(next);
        setPageState(1);
      });
      syncToUrl(1, committedSearch, filters, next, pageSize);
    },
    [sort, committedSearch, filters, pageSize, syncToUrl],
  );

  // ── Debounced search: setSearch updates the input instantly; commits after debounce ──
  const setSearch = useCallback(
    (value: string) => {
      // Update the input INSTANTLY (so the controlled input doesn't lag)
      setInputSearch(value);

      // Cancel the previous timer
      if (debounceTimerRef.current !== null) {
        clearTimeout(debounceTimerRef.current);
      }

      const commit = () => {
        startTransition(() => {
          setCommittedSearch(value);
          setPageState(1);
        });
        syncToUrl(1, value, filters, sort, pageSize);
      };

      if (debounceMs === 0) {
        commit();
      } else {
        debounceTimerRef.current = setTimeout(() => {
          debounceTimerRef.current = null;
          commit();
        }, debounceMs);
      }
    },
    [debounceMs, filters, sort, pageSize, syncToUrl],
  );

  // ── onSearchSubmit: skip the debounce for an instant flush ────────────────
  const onSearchSubmit = useCallback(() => {
    // Cancel the pending debounce
    if (debounceTimerRef.current !== null) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    // Commit inputSearch immediately
    startTransition(() => {
      setCommittedSearch(inputSearch);
      setPageState(1);
    });
    syncToUrl(1, inputSearch, filters, sort, pageSize);
  }, [inputSearch, filters, sort, pageSize, syncToUrl]);

  // Clear the timer on unmount
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current !== null) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  // ── Query params (for fetch) ────────────────────────────────────────────────
  // Don't send the "all" value to the backend — pass only real filter values
  const buildParams = useCallback(() => {
    const params: Record<string, any> = { page, limit: pageSize };
    if (committedSearch) params.search = committedSearch;
    Object.entries(filters).forEach(([key, val]) => {
      if (val && val !== "all") params[key] = val;
    });
    // Sort metadata is shared by client comparators and server DTOs.
    if (sort.sortBy) {
      params.sortBy = sort.sortBy;
      params.sortOrder = sort.sortOrder;
      if (sort.sortType) params.sortType = sort.sortType;
    }
    return params;
  }, [page, pageSize, committedSearch, filters, sort]);

  // ── react-query (suspense) ─────────────────────────────────────────────────
  // The initial load suspends (the SuspenseBoundary above shows a spinner; the
  // error is caught there). Later changes happen inside a transition, so they
  // don't suspend again — old data stays while isFetching/isPending dims the table.
  // #101: explicit staleTime yoksa, clientListFetcher (isClientList marker) otomatik
  // CLIENT_LIST_STALE_MS alır — 7 client-list sayfası değişmeden faydalanır.
  const effectiveStaleTime =
    staleTime ||
    ((fetcher as ClientListFetcher).isClientList ? CLIENT_LIST_STALE_MS : 0);
  const queryResult = useSuspenseQuery({
    // [resource, 'list', {...}] — shares the resource prefix with detail keys so
    // a mutation's invalidateQueries({ queryKey: [resource] }) refreshes lists too.
    queryKey: adminKeys.list(queryKey, {
      page,
      pageSize,
      search: committedSearch,
      filters,
      sort,
    }),
    queryFn: async () => {
      const response = await fetcher(buildParams());
      return response.data;
    },
    staleTime: effectiveStaleTime,
    // #101: staleTime>0 (client-list) → mount'ta bayat değilse tekrar indirme;
    // =0 (server-paginated) → 'always', her dönüşte taze (mevcut davranış).
    refetchOnMount: effectiveStaleTime > 0 ? true : "always",
  });

  // ── Tab URL sync ────────────────────────────────────────────────────────────
  const setTabUrl = useCallback(
    (
      key: string,
      opts: {
        defaultTab?: string;
        resetFilters?: boolean;
        resetSearch?: boolean;
      } = {},
    ) => {
      if (!syncUrl) return;
      const {
        defaultTab = "",
        resetFilters = false,
        resetSearch = false,
      } = opts;
      // Start from the current URL; params the hook doesn't own are preserved.
      const params = new URLSearchParams(searchParamsRef.current.toString());
      // Tab
      if (key && key !== defaultTab) {
        params.set("tab", key);
      } else {
        params.delete("tab");
      }
      // The page always resets to 1
      params.delete("page");
      if (resetFilters) {
        Object.keys(initialFilters).forEach((k) => params.delete(k));
      }
      if (resetSearch) {
        params.delete("q");
        if (debounceTimerRef.current !== null) {
          clearTimeout(debounceTimerRef.current);
          debounceTimerRef.current = null;
        }
        setInputSearch("");
      }
      startTransition(() => {
        setPageState(1);
        if (resetFilters) setFiltersState({ ...initialFilters });
        if (resetSearch) setCommittedSearch("");
      });
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [syncUrl, pathname, router, initialFilters],
  );

  // ── Data extraction (suspense → data is always defined) ────────────────────
  const { rows, total } = extractData<T>(queryResult.data, queryKey);
  const totalPages = Math.ceil(total / pageSize) || 1;

  return {
    rows,
    total,
    page,
    setPage,
    pageSize,
    setPageSize,
    totalPages,
    search: inputSearch,
    setSearch,
    onSearchSubmit,
    filters,
    setFilter,
    sort,
    setSort,
    // Dim the table during a transition (filter/search/page) or a background refetch.
    isLoading: isPending || queryResult.isFetching,
    data: queryResult.data,
    refetch: queryResult.refetch,
    setTabUrl,
  };
}
