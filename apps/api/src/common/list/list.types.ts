export type SortDirection = "asc" | "desc";

/** Comparator family hint sent by the admin table (see FE `components/table/meta.ts`). */
export type SortType = "text" | "number" | "date";

export interface ListQuery {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: SortDirection;
  sortType?: SortType;
}

export interface PaginatedResult<T> {
  data: T[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}
