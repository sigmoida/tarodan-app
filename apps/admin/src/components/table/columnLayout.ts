import type { ColumnDef } from "@tanstack/react-table";
import type { CellAlign } from "./meta";

const ALIGN_CLASS: Record<CellAlign, string> = {
  left: "text-left",
  right: "text-right",
  center: "text-center",
};

/**
 * Width (px) of the selectable/checkbox column. `DataTable` also applies
 * this to the `<colgroup>`'s `<col>` for that column; its `<TableHead>`
 * uses the equivalent Tailwind class (`w-11` = 44px) since a static
 * utility class can't read a JS constant — keep the two in sync by hand.
 */
export const SELECTABLE_COLUMN_WIDTH = 44;

export interface ColumnLayout<T> {
  /**
   * Sizing is opt-in: true when columns come from the `col.*` factory (carry
   * meta). Without meta (legacy raw ColumnDef consumers) the table keeps its
   * old, unsized behavior.
   */
  hasSizing: boolean;
  tableMinWidth: number;
  widthOf: (c: ColumnDef<T, any>) => string;
  alignOf: (align?: CellAlign) => string | undefined;
}

/**
 * Column width/alignment math for `DataTable`'s `table-fixed` + `colgroup`
 * sizing system. Pure function of `columns`/`selectable` — extracted out of
 * the component body so it's testable without rendering anything.
 *
 * Width basis: fixed columns stay at minWidth, flexible columns share
 * remaining space in proportion to minWidth. Below the total minimum the
 * wrapper scrolls.
 */
export function computeColumnLayout<T>(
  columns: ColumnDef<T, any>[],
  selectable?: boolean,
): ColumnLayout<T> {
  const hasSizing = columns.some(
    (c) =>
      c.meta &&
      (c.meta.minWidth != null || c.meta.grow != null || c.meta.align != null),
  );

  const colMin = (c: ColumnDef<T, any>) => c.meta?.minWidth ?? 140;
  // Flexible columns get 20% headroom above their configured minWidth for the
  // *floor* calc below — on desktop the proportional bonus space normally keeps
  // columns well above minWidth, so authors size it tight; once the viewport is
  // narrow enough to be scrolling, columns land exactly on that floor with zero
  // slack and short text gets truncated for no reason. The headroom only shifts
  // where the floor sits — widthOf's calc ratio (desktop width) is unaffected,
  // since the same factor cancels out of every column's share.
  const FLEX_SLACK = 1.2;
  const flexMin = (c: ColumnDef<T, any>) => colMin(c) * FLEX_SLACK;
  const fixedWidth =
    (selectable ? SELECTABLE_COLUMN_WIDTH : 0) +
    columns.reduce((sum, c) => sum + (c.meta?.fixed ? colMin(c) : 0), 0);
  const flexibleWidth = columns.reduce(
    (sum, c) => sum + (c.meta?.fixed ? 0 : flexMin(c)),
    0,
  );
  const tableMinWidth = hasSizing ? fixedWidth + flexibleWidth : 0;
  const widthOf = (c: ColumnDef<T, any>) => {
    if (c.meta?.fixed || flexibleWidth === 0) return `${colMin(c)}px`;
    const share = flexMin(c) / flexibleWidth;
    return `calc((100% - ${fixedWidth}px) * ${share})`;
  };
  const alignOf = (align?: CellAlign) =>
    align ? ALIGN_CLASS[align] : undefined;

  return { hasSizing, tableMinWidth, widthOf, alignOf };
}
