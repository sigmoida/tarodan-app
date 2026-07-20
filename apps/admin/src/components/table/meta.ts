import { type RowData } from "@tanstack/react-table";

export type CellAlign = "left" | "right" | "center";

/** Sort direction — a single sortable column is either ascending or descending. */
export type SortOrder = "asc" | "desc";

/**
 * Comparator family used for client-side (in-memory) sorting. The `col.*` factory
 * derives it from the cell producer (date→date, money/number→number, everything
 * else→text); `paginateClient` reads it to pick numeric / date / `localeCompare('tr')`.
 */
export type SortType = "text" | "number" | "date";

/** The active sort. `sortBy` is a column `sortKey`; empty `sortBy` means unsorted. */
export interface SortState {
  sortBy?: string;
  sortOrder: SortOrder;
  /** Comparator hint for client-list sorting; derived from the column meta. */
  sortType?: SortType;
}

/** Toggle sort on a column: asc → desc → off. `sortType` feeds the client comparator. */
export type SetSort = (sortKey: string, sortType?: SortType) => void;

/** The column's table behavior — the factory (columns.tsx) fills it, DataTable reads it. */
export interface CellColumnMeta {
  /** Header + cell alignment (always the same). */
  align?: CellAlign;
  /** The column's base px width: its share of the horizontal-scroll threshold + proportional growth weight. */
  minWidth?: number;
  /** @deprecated No longer affects width; column width is managed by `minWidth`. */
  grow?: number;
  /** Field key sent to the backend (`sortBy`) / read by the client comparator. */
  sortKey?: string;
  /** Opt-in: when true, DataTable renders a clickable sort control on the header. */
  sortable?: boolean;
  /** Comparator family for client-side sorting (see `SortType`). */
  sortType?: SortType;
}

// Extend react-table's ColumnMeta with our fields (type-safe meta).
declare module "@tanstack/react-table" {
  interface ColumnMeta<TData extends RowData, TValue> extends CellColumnMeta {}
}
