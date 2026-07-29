import {
  ADMIN_LIST_DEFAULT_LIMIT,
  ADMIN_LIST_DEFAULT_PAGE,
  ADMIN_LIST_MAX_LIMIT,
} from "./list.constants";
import type { ListQuery, PaginatedResult } from "./list.types";

function normalizePositiveInteger(
  value: number | undefined,
  fallback: number,
  maximum?: number,
): number {
  if (value === undefined || !Number.isFinite(value) || value < 1)
    return fallback;
  const normalized = Math.floor(value);
  return maximum === undefined ? normalized : Math.min(normalized, maximum);
}

function compareValues(
  left: unknown,
  right: unknown,
  query: ListQuery,
): number {
  if (query.sortType === "number") return Number(left) - Number(right);
  if (query.sortType === "date")
    return (
      new Date(left as string | number | Date).getTime() -
      new Date(right as string | number | Date).getTime()
    );
  return String(left).localeCompare(String(right), "tr", {
    numeric: true,
    sensitivity: "base",
  });
}

/**
 * Sort and paginate rows whose displayed sort value is computed outside Prisma
 * (for example a denormalized user name or a JSON metadata field).
 */
export function paginateComputedRows<T>(
  rows: readonly T[],
  getValue: (row: T) => unknown,
  query: ListQuery,
): PaginatedResult<T> {
  const page = normalizePositiveInteger(query.page, ADMIN_LIST_DEFAULT_PAGE);
  const limit = normalizePositiveInteger(
    query.limit,
    ADMIN_LIST_DEFAULT_LIMIT,
    ADMIN_LIST_MAX_LIMIT,
  );
  const direction = query.sortOrder === "asc" ? 1 : -1;
  const isEmpty = (value: unknown) => value == null || value === "";
  const sorted = [...rows].sort((leftRow, rightRow) => {
    const left = getValue(leftRow);
    const right = getValue(rightRow);
    if (isEmpty(left) && isEmpty(right)) return 0;
    if (isEmpty(left)) return 1;
    if (isEmpty(right)) return -1;
    return compareValues(left, right, query) * direction;
  });
  const start = (page - 1) * limit;

  return {
    data: sorted.slice(start, start + limit),
    meta: {
      total: rows.length,
      page,
      limit,
      totalPages: Math.ceil(rows.length / limit),
    },
  };
}
