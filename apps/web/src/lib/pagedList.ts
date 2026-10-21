/** @format */

import { unwrapList } from "@/lib/unwrapList";

/** One fetched page of an envelope list (`{ data|products, meta }`). */
export interface PagedResult<T> {
  items: T[];
  page: number;
  totalPages: number;
}

/** Collapse a list response (axios `res.data`) into one `PagedResult`. */
export function toPagedResult<T>(raw: unknown, page: number): PagedResult<T> {
  const meta = (raw as { meta?: { totalPages?: unknown } } | null)?.meta;
  return {
    items: unwrapList<T>(raw),
    page,
    totalPages: Number(meta?.totalPages) || 1,
  };
}

/** The next page number, or `undefined` once the last page is loaded. */
export function nextPageParam<T>(last: PagedResult<T>): number | undefined {
  return last.page < last.totalPages ? last.page + 1 : undefined;
}

/**
 * Flatten loaded pages into one list without duplicates. A refetch of several
 * pages can shift rows across a page boundary (a listing leaves the list), so
 * the same id may appear twice; the first occurrence wins.
 */
export function flattenPages<T extends { id: string }>(
  pages: PagedResult<T>[] | undefined,
): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const page of pages ?? []) {
    for (const item of page.items) {
      if (seen.has(item.id)) continue;
      seen.add(item.id);
      out.push(item);
    }
  }
  return out;
}
