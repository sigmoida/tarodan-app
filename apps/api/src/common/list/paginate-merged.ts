import {
  ADMIN_LIST_DEFAULT_LIMIT,
  ADMIN_LIST_DEFAULT_PAGE,
  ADMIN_LIST_MAX_LIMIT,
} from "./list.constants";
import type { ListQuery, PaginatedResult } from "./list.types";

/**
 * One table feeding a list that is paginated across several tables.
 * `head(take)` returns the source's first `take` rows in a stable order (with a
 * unique tie-break). That order should follow `compare` for the page to read
 * well; where it cannot (collation), pages still never repeat or drop a row.
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
 *
 * The heads are MERGED, never re-sorted: each source keeps the order the
 * database returned. `compare` only picks which source's next row comes first,
 * so the first `take` merged rows depend only on each source's first `take`
 * rows. Pages therefore never repeat or drop a row even where JS and the
 * database disagree on an order (string collation, text ids, NULLs).
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
  const merged = mergeSorted(heads, compare, take);

  return {
    data: merged.slice((page - 1) * limit),
    meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
  };
}

/**
 * Stable k-way merge of already-ordered lists, up to `take` rows. On a tie the
 * earlier source wins, so the result is deterministic across pages.
 */
function mergeSorted<TRow>(
  lists: readonly (readonly TRow[])[],
  compare: (left: TRow, right: TRow) => number,
  take: number,
): TRow[] {
  const cursors = lists.map(() => 0);
  const out: TRow[] = [];
  while (out.length < take) {
    let best = -1;
    for (let i = 0; i < lists.length; i++) {
      if (cursors[i] >= lists[i].length) continue;
      if (
        best === -1 ||
        compare(lists[i][cursors[i]], lists[best][cursors[best]]) < 0
      ) {
        best = i;
      }
    }
    if (best === -1) break;
    out.push(lists[best][cursors[best]]);
    cursors[best] += 1;
  }
  return out;
}
