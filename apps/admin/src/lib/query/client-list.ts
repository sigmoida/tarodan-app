import type { AxiosResponse } from 'axios';

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
  [key: string]: any;
}

export interface Paginated<T> {
  data: T[];
  meta: { total: number };
}

type SearchFields<T> = (keyof T)[] | ((item: T) => Array<string | null | undefined>);

export interface PaginateClientOptions<T> {
  /** Fields (or a selector) matched case-insensitively against `params.search`. */
  searchFields?: SearchFields<T>;
  /** Extra predicate applied before search/pagination (e.g. status filter). */
  filter?: (item: T, params: ClientListParams) => boolean;
}

/** Filter → search → paginate an in-memory list into a `{ data, meta }` page. */
export function paginateClient<T>(
  items: T[],
  params: ClientListParams,
  opts: PaginateClientOptions<T> = {},
): Paginated<T> {
  const { page = 1, limit = 20, search } = params;
  let rows = items;

  if (opts.filter) rows = rows.filter((r) => opts.filter!(r, params));

  const q = search?.trim().toLocaleLowerCase('tr');
  if (q && opts.searchFields) {
    const getFields =
      typeof opts.searchFields === 'function'
        ? opts.searchFields
        : (item: T) => (opts.searchFields as (keyof T)[]).map((f) => item[f] as any);
    rows = rows.filter((item) =>
      getFields(item).some((v) => (v ? String(v).toLocaleLowerCase('tr').includes(q) : false)),
    );
  }

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
export type ClientListFetcher = ((params: Record<string, any>) => Promise<AxiosResponse<any>>) & {
  isClientList?: boolean;
};

export function clientListFetcher<T>(
  load: () => Promise<AxiosResponse<any>>,
  extract: (raw: any) => T[],
  opts?: PaginateClientOptions<T>,
) {
  const fetcher: ClientListFetcher = async (params: Record<string, any>): Promise<AxiosResponse<Paginated<T>>> => {
    const res = await load();
    const page = paginateClient<T>(extract(res.data), params, opts);
    return { ...res, data: page };
  };
  fetcher.isClientList = true;
  return fetcher;
}
