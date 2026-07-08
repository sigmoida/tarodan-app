import { type RowData } from '@tanstack/react-table';

export type CellAlign = 'left' | 'right' | 'center';

/** The column's table behavior — the factory (columns.tsx) fills it, DataTable reads it. */
export interface CellColumnMeta {
  /** Header + cell alignment (always the same). */
  align?: CellAlign;
  /** The column's base px width: its share of the horizontal-scroll threshold + proportional growth weight. */
  minWidth?: number;
  /** @deprecated No longer affects width; column width is managed by `minWidth`. */
  grow?: number;
}

// Extend react-table's ColumnMeta with our fields (type-safe meta).
declare module '@tanstack/react-table' {
  interface ColumnMeta<TData extends RowData, TValue> extends CellColumnMeta {}
}
