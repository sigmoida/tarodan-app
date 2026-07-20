export type SortDirection = "asc" | "desc";

export interface ListQuery {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: SortDirection;
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
