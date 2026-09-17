import {
  ADMIN_LIST_DEFAULT_LIMIT,
  ADMIN_LIST_DEFAULT_PAGE,
  ADMIN_LIST_MAX_LIMIT,
} from "./list.constants";
import type { ListQuery, PaginatedResult } from "./list.types";

/**
 * One table feeding a list that is paginated across several tables.
 * `head(take)` must return the source's first `take` rows in the SAME order
 * `compare` defines — including its tie-break — or rows can repeat or vanish at
 * page boundaries.
 */
export interface MergedListSource<TRow> {
  count(): PromiseLike<number>;
  head(take: number): PromiseLike<readonly TRow[]>;
}

function positive(
  value: number | undefined,
  fallback: number,
  maximum?: number,
): number {
  if (value === undefined || !Number.isFinite(value) || value < 1)
    return fallback;
  const n = Math.floor(value);
  return maximum === undefined ? n : Math.min(n, maximum);
}

/**
 * `paginate` for a list whose rows come from more than one table (the admin
 * orders list: checkout groups + groupless orders). Same defaults, cap and
 * `{ data, meta }` envelope as `paginate`.
 *
 * A row on page P is among the first P×limit rows of the merged order, so it is
 * among the first P×limit rows of its own source: each source contributes that
 * many candidates, they are merged with `compare`, and the page is sliced out.
 * Cost grows with the page number, which is acceptable for operator lists that
 * are read from the top.
 */
export async function paginateMerged<TRow>(
  sources: readonly MergedListSource<TRow>[],
  compare: (left: TRow, right: TRow) => number,
  query: Pick<ListQuery, "page" | "limit">,
): Promise<PaginatedResult<TRow>> {
  const page = positive(query.page, ADMIN_LIST_DEFAULT_PAGE);
  const limit = positive(
    query.limit,
    ADMIN_LIST_DEFAULT_LIMIT,
    ADMIN_LIST_MAX_LIMIT,
  );
  const take = page * limit;

  const [counts, heads] = await Promise.all([
    Promise.all(sources.map((source) => source.count())),
    Promise.all(sources.map((source) => source.head(take))),
  ]);
  const total = counts.reduce((sum, n) => sum + n, 0);
  const merged = heads.flat().sort(compare);

  return {
    data: merged.slice((page - 1) * limit, take),
    meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
  };
}
