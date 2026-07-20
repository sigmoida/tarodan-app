"use client";

import { Fragment, type ReactNode } from "react";
import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  type ColumnDef,
} from "@tanstack/react-table";

// framer-motion is code-split (#102): it only loads on the few list pages that
// pass `renderExpanded`, staying out of every other list bundle.
const DataTableExpandRow = dynamic(() => import("./DataTableExpandRow"), {
  ssr: false,
});
import {
  Spinner,
  Checkbox,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@tarodan/ui";
import {
  type CellAlign,
  type SetSort,
  type SortState,
} from "@/components/table/meta";
import { SortableHeader } from "@/components/table/SortableHeader";

export type { ColumnDef };

const ALIGN_CLASS: Record<CellAlign, string> = {
  left: "text-left",
  right: "text-right",
  center: "text-center",
};

export interface DataTableProps<T> {
  columns: ColumnDef<T, any>[];
  data: T[];
  loading?: boolean;
  /** Text shown when there is no data. */
  emptyText?: string;
  /** Action shown below the text when there is no data (e.g. an "Add first record" button). */
  emptyAction?: ReactNode;
  /** On row click (e.g. go to detail). */
  onRowClick?: (row: T) => void;
  /** Extra className per row (e.g. selected/disputed row highlight). */
  rowClassName?: (row: T) => string | undefined;
  /** Row id — required for selection. */
  getRowId?: (row: T) => string;
  // ── Multi-select (optional) ──
  selectable?: boolean;
  selectedIds?: string[];
  onToggleRow?: (id: string) => void;
  onToggleAll?: (ids: string[]) => void;
  // ── Expandable row (optional) ──
  /** Panel rendered full-width below the open row (e.g. brand models). */
  renderExpanded?: (row: T) => ReactNode;
  /** Id of the currently open row (matches getRowId). When set, it opens/closes smoothly. */
  expandedId?: string | null;
  // ── Sorting (optional) ──
  /** The active sort; drives header highlight + arrow direction. */
  sort?: SortState;
  /**
   * Toggle handler. Sort controls render ONLY when this is provided AND a column
   * carries `meta.sortable` — legacy tables (no handler / no meta) are untouched.
   */
  onSort?: SetSort;
}

/**
 * The SINGLE shared table for admin list pages. @tanstack/react-table engine +
 * design-system `Table`/`Checkbox` (no legacy `.admin-table`/`.admin-card`).
 * Columns are defined with ColumnDef; loading/empty, row-click and optional
 * multi-select / expandable row are handled internally.
 */
export function DataTable<T>({
  columns,
  data,
  loading,
  emptyText,
  emptyAction,
  onRowClick,
  rowClassName,
  getRowId,
  selectable,
  selectedIds = [],
  onToggleRow,
  onToggleAll,
  renderExpanded,
  expandedId,
  sort,
  onSort,
}: DataTableProps<T>) {
  const t = useTranslations();
  const resolvedEmptyText = emptyText ?? t("admin.shared.table.noRecords");
  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getRowId,
  });

  const rowIds = getRowId ? data.map((d) => getRowId(d)) : [];
  const allSelected =
    selectable &&
    rowIds.length > 0 &&
    rowIds.every((id) => selectedIds.includes(id));
  const colSpan = columns.length + (selectable ? 1 : 0);

  // Sizing system is opt-in: when columns come from the `col.*` factory (carry
  // meta), fixed-layout + colgroup + alignment kick in. Without meta (legacy raw
  // ColumnDef consumers) the table keeps its old behavior unchanged.
  const hasSizing = columns.some(
    (c) =>
      c.meta &&
      (c.meta.minWidth != null || c.meta.grow != null || c.meta.align != null),
  );
  // Width basis: each column gets minWidth px; the table's min-width is their
  // sum. Above that threshold columns grow proportionally; below it the table
  // stays at min-width and the wrapper falls back to horizontal scroll. (Putting
  // min-width on `<col>` doesn't work — the browser ignores it; hence on `<table>`.)
  const colMin = (c: (typeof columns)[number]) => c.meta?.minWidth ?? 140;
  const tableMinWidth = hasSizing
    ? (selectable ? 44 : 0) + columns.reduce((sum, c) => sum + colMin(c), 0)
    : 0;
  const alignOf = (align?: CellAlign) =>
    align ? ALIGN_CLASS[align] : undefined;

  // Initial load (no data yet) shows a full spinner; on search/filter refetch the
  // existing rows are kept and slightly dimmed (keepPreviousData behavior).
  const isInitialLoad = loading && data.length === 0;
  const isRefetching = loading && data.length > 0;

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-surface-elevated shadow-sm">
      <div className="overflow-x-auto">
        <Table
          scrollable={false}
          className={hasSizing ? "table-fixed" : undefined}
          style={hasSizing ? { minWidth: `${tableMinWidth}px` } : undefined}
        >
          {hasSizing && (
            <colgroup>
              {selectable && <col style={{ width: "44px" }} />}
              {columns.map((c, i) => (
                <col key={c.id ?? i} style={{ width: `${colMin(c)}px` }} />
              ))}
            </colgroup>
          )}
          <TableHeader>
            {table.getHeaderGroups().map((hg) => (
              <TableRow key={hg.id}>
                {selectable && (
                  <TableHead className="w-10">
                    <Checkbox
                      checked={!!allSelected}
                      onChange={() => onToggleAll?.(rowIds)}
                      aria-label={t("admin.shared.table.selectAll")}
                    />
                  </TableHead>
                )}
                {hg.headers.map((h) => {
                  const meta = h.column.columnDef.meta;
                  const canSort = !!onSort && meta?.sortable && !!meta.sortKey;
                  const isActive = canSort && sort?.sortBy === meta.sortKey;
                  return (
                    <TableHead key={h.id} className={alignOf(meta?.align)}>
                      {h.isPlaceholder ? null : canSort ? (
                        <SortableHeader
                          sortKey={meta.sortKey!}
                          sortType={meta.sortType}
                          active={!!isActive}
                          order={sort?.sortOrder}
                          align={meta?.align}
                          onSort={onSort!}
                        >
                          {flexRender(
                            h.column.columnDef.header,
                            h.getContext(),
                          )}
                        </SortableHeader>
                      ) : (
                        flexRender(h.column.columnDef.header, h.getContext())
                      )}
                    </TableHead>
                  );
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody
            className={
              isRefetching
                ? "opacity-60 transition-opacity duration-200 pointer-events-none"
                : "transition-opacity duration-200"
            }
          >
            {isInitialLoad ? (
              <TableRow>
                <TableCell
                  colSpan={colSpan}
                  className="p-8 text-center text-muted"
                >
                  <Spinner size="md" className="mx-auto" />
                </TableCell>
              </TableRow>
            ) : data.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={colSpan}
                  className="p-8 text-center text-muted"
                >
                  <div className="flex flex-col items-center gap-3">
                    <span>{resolvedEmptyText}</span>
                    {emptyAction}
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              table.getRowModel().rows.map((row) => {
                const id = getRowId ? getRowId(row.original) : row.id;
                const isExpanded = renderExpanded != null && expandedId === id;
                return (
                  <Fragment key={row.id}>
                    <TableRow
                      onClick={
                        onRowClick
                          ? (e) => {
                              // Clicking interactive elements inside the row does
                              // not trigger the row click — their own behavior runs.
                              if (
                                (e.target as HTMLElement).closest(
                                  "a, button, input, select, textarea, label, [role='button']",
                                )
                              )
                                return;
                              onRowClick(row.original);
                            }
                          : undefined
                      }
                      className={[
                        onRowClick ? "cursor-pointer" : "",
                        selectable && selectedIds.includes(id)
                          ? "bg-primary-500/5"
                          : "",
                        rowClassName?.(row.original) ?? "",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                    >
                      {selectable && (
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <Checkbox
                            checked={selectedIds.includes(id)}
                            onChange={() => onToggleRow?.(id)}
                            aria-label={t("admin.shared.table.selectRow")}
                          />
                        </TableCell>
                      )}
                      {row.getVisibleCells().map((cell) => (
                        <TableCell
                          key={cell.id}
                          className={alignOf(cell.column.columnDef.meta?.align)}
                        >
                          {flexRender(
                            cell.column.columnDef.cell,
                            cell.getContext(),
                          )}
                        </TableCell>
                      ))}
                    </TableRow>
                    {renderExpanded && (
                      <TableRow className="!border-t-0 hover:bg-transparent">
                        <TableCell colSpan={colSpan} className="!p-0">
                          <DataTableExpandRow isExpanded={isExpanded}>
                            {renderExpanded(row.original)}
                          </DataTableExpandRow>
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
