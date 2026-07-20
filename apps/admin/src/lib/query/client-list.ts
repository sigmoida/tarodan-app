import type { AxiosResponse } from "axios";
import type { SortType } from "@/components/table/meta";

/**
 * Client-side list adapter.
 *
 * Some admin list APIs return the FULL list with no server pagination/search
 * (`getCategories`, `getBrands`, `getManufacturers`, `getCarModels`, attribute
 * APIs), while others (`getProducts`, `getCollections`) are server-paginated.
 * To run BOTH through the same `ResourceList` → `useAdminResource` pipeline, wrap
 * a full-load fetcher so it returns the `{ data, meta: { total } }` shape that
 * `useAdminResource.extractData` reads. Search + pagination then work uniformly.
 *
 * Server-paginated resources skip this and pass their `adminApi.getX` directly.
 */

export interface ClientListParams {
  page?: number;
  limit?: number;
  search?: string;
  /** Column `sortKey` to sort by (from `useAdminResource`'s sort state). */
  sortBy?: string;
  sortOrder?: "asc" | "desc";
  /** Comparator family; when absent (e.g. after URL restore) it is auto-detected. */
  sortType?: SortType;
  [key: string]: any;
}

export interface Paginated<T> {
  data: T[];
  meta: { total: number };
}

type SearchFields<T> =
  (keyof T)[] | ((item: T) => Array<string | null | undefined>);

export interface PaginateClientOptions<T> {
  /**
   * Fields (or a selector) matched case-insensitively against `params.search`.
   * Omit for FULL-CONTENT search (#378): every string/number value on the row
   * (incl. nested relations) is scanned, so the search box covers all displayed
   * columns. Only pass this to intentionally NARROW the searched fields.
   */
  searchFields?: SearchFields<T>;
  /** Extra predicate applied before search/pagination (e.g. status filter). */
  filter?: (item: T, params: ClientListParams) => boolean;
}

/**
 * Collect every string/number leaf value on a row — the default full-content
 * search set when no `searchFields` is given (#378). Recurses into nested
 * objects/arrays (relations like `owner.displayName`) up to a small depth so
 * the whole row is searchable, not just its top-level fields.
 */
function collectSearchableValues(
  value: unknown,
  depth = 0,
  acc: string[] = [],
): string[] {
  if (value == null) return acc;
  const type = typeof value;
  if (type === "string" || type === "number") {
    acc.push(String(value));
  } else if (depth < 4 && type === "object" && !(value instanceof Date)) {
    if (Array.isArray(value)) {
      for (const v of value) collectSearchableValues(v, depth + 1, acc);
    } else {
      for (const v of Object.values(value as Record<string, unknown>)) {
        collectSearchableValues(v, depth + 1, acc);
      }
    }
  }
  return acc;
}

/** Read a (possibly dotted) key path off a row — supports `sortKey: 'buyer.name'`. */
function readPath(obj: unknown, path: string): unknown {
  return path
    .split(".")
    .reduce<unknown>(
      (o, k) => (o == null ? undefined : (o as Record<string, unknown>)[k]),
      obj,
    );
}

/** Compare two non-empty cell values using the column's comparator family. */
function compareBy(a: unknown, b: unknown, type?: SortType): number {
  if (type === "number") return Number(a) - Number(b);
  if (type === "date")
    return new Date(a as any).getTime() - new Date(b as any).getTime();
  // 'text' or unknown → Turkish locale compare; `numeric` keeps "2" < "10" and
  // makes the type-less URL-restore path behave sensibly for numbers too.
  return String(a).localeCompare(String(b), "tr", { numeric: true });
}

/** Sort a copy of `rows` by `sortBy`/`sortOrder`; empty values always sort last. */
function sortRows<T>(rows: T[], params: ClientListParams): T[] {
  const { sortBy, sortOrder = "asc", sortType } = params;
  if (!sortBy) return rows;
  const dir = sortOrder === "desc" ? -1 : 1;
  const isEmpty = (v: unknown) => v == null || v === "";
  return [...rows].sort((ra, rb) => {
    const a = readPath(ra, sortBy);
    const b = readPath(rb, sortBy);
    if (isEmpty(a) && isEmpty(b)) return 0;
    if (isEmpty(a)) return 1;
    if (isEmpty(b)) return -1;
    return compareBy(a, b, sortType) * dir;
  });
}

/** Filter → search → sort → paginate an in-memory list into a `{ data, meta }` page. */
export function paginateClient<T>(
  items: T[],
  params: ClientListParams,
  opts: PaginateClientOptions<T> = {},
): Paginated<T> {
  const { page = 1, limit = 20, search } = params;
  let rows = items;

  if (opts.filter) rows = rows.filter((r) => opts.filter!(r, params));

  const q = search?.trim().toLocaleLowerCase("tr");
  if (q) {
    // No searchFields → full-content search across every value on the row.
    const getFields: (item: T) => unknown[] = opts.searchFields
      ? typeof opts.searchFields === "function"
        ? (opts.searchFields as (item: T) => unknown[])
        : (item) => (opts.searchFields as (keyof T)[]).map((f) => item[f])
      : (item) => collectSearchableValues(item);
    rows = rows.filter((item) =>
      getFields(item).some((v) =>
        v != null ? String(v).toLocaleLowerCase("tr").includes(q) : false,
      ),
    );
  }

  rows = sortRows(rows, params);

  const total = rows.length;
  const start = (page - 1) * limit;
  return { data: rows.slice(start, start + limit), meta: { total } };
}

/**
 * Wrap a full-load API into a `ResourceList` fetcher.
 *
 *   fetcher={clientListFetcher(
 *     () => adminApi.getCategories(),
 *     (raw) => raw.data ?? [],
 *     { searchFields: ['name', 'slug', 'description'] },
 *   )}
 */
/**
 * #101: full-load kaynakların, detail→list dönüşünde (refetchOnMount) tüm tabloyu
 * yeniden indirmesini kesen staleTime (5dk). useAdminResource clientListFetcher'ı
 * `isClientList` marker'ından tanıyıp bunu otomatik uygular.
 */
export const CLIENT_LIST_STALE_MS = 5 * 60 * 1000;

/** clientListFetcher ile üretilen fetcher — useAdminResource otomatik staleTime için tanır. */
export type ClientListFetcher = ((
  params: Record<string, any>,
) => Promise<AxiosResponse<any>>) & {
  isClientList?: boolean;
};

export function clientListFetcher<T>(
  load: () => Promise<AxiosResponse<any>>,
  extract: (raw: any) => T[],
  opts?: PaginateClientOptions<T>,
) {
  const fetcher: ClientListFetcher = async (
    params: Record<string, any>,
  ): Promise<AxiosResponse<Paginated<T>>> => {
    const res = await load();
    const page = paginateClient<T>(extract(res.data), params, opts);
    return { ...res, data: page };
  };
  fetcher.isClientList = true;
  return fetcher;
}
