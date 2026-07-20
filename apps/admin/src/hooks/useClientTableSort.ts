"use client";

import { useCallback, useMemo, useState } from "react";
import { type SetSort, type SortState } from "@/components/table/meta";
import { paginateClient } from "@/lib/query/client-list";

/**
 * Shared sort state for full-load tables that do not use ResourceList.
 * Reuses paginateClient so comparison and empty-value behavior stay identical
 * across all client-side admin lists.
 */
export function useClientTableSort<T>(rows: T[]) {
  const [sort, setSortState] = useState<SortState>({ sortOrder: "asc" });

  const setSort = useCallback<SetSort>((sortKey, sortType) => {
    setSortState((current) =>
      current.sortBy !== sortKey
        ? { sortBy: sortKey, sortOrder: "asc", sortType }
        : current.sortOrder === "asc"
          ? { sortBy: sortKey, sortOrder: "desc", sortType }
          : { sortOrder: "asc" },
    );
  }, []);

  const sortedRows = useMemo(
    () =>
      paginateClient(rows, {
        ...sort,
        page: 1,
        limit: Math.max(rows.length, 1),
      }).data,
    [rows, sort],
  );

  return { rows: sortedRows, sort, setSort };
}
