import { type RowData } from '@tanstack/react-table';

export type CellAlign = 'left' | 'right' | 'center';

/** Kolonun tablo davranışı — factory (columns.tsx) doldurur, DataTable okur. */
export interface CellColumnMeta {
  /** Başlık + hücre hizası (ikisi daima aynı). */
  align?: CellAlign;
  /** Kolonun taban px genişliği: yatay-scroll eşiğinin payı + orantılı büyüme ağırlığı. */
  minWidth?: number;
  /** @deprecated Genişliği artık etkilemez; kolon genişliğini `minWidth` yönetir. */
  grow?: number;
}

// react-table ColumnMeta'yı bizim alanlarımızla genişlet (tip güvenli meta).
declare module '@tanstack/react-table' {
  interface ColumnMeta<TData extends RowData, TValue> extends CellColumnMeta {}
}
