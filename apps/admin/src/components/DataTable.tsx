"use client";

import { Fragment, useContext, useMemo, type ReactNode } from "react";
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
  EmptyState,
  Checkbox,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@tarodan/ui";
import { type SetSort, type SortState } from "@/components/table/meta";
import { SortableHeader } from "@/components/table/SortableHeader";
import {
  computeColumnLayout,
  SELECTABLE_COLUMN_WIDTH,
} from "@/components/table/columnLayout";
import { ResourceListContext } from "@/context/ResourceListContext";

export type { ColumnDef };

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

  // Register columns with the enclosing ResourceList (if any) so its toolbar can
  // offer a CSV export. Safe when standalone — the context is simply absent.
  const resourceList = useContext(ResourceListContext);
  if (resourceList) {
    resourceList.exportRef.current = columns;
    // Kolonlar bu tabloya basılan satır şekline göre yazılır (örn. grup satırı)
    // — CSV de aynı veriyi kullanmalı, ham context satırlarını değil.
    resourceList.exportRowsRef.current = data as any[];
  }
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

  // `columns` is a module-level static array per the `col.*` factory
  // convention, so this only actually needs to recompute when it or
  // `selectable` change — not on every unrelated re-render (search-box
  // keystrokes, row hover/selection, the isRefetching dim/undim).
  const { hasSizing, tableMinWidth, widthOf, alignOf } = useMemo(
    () => computeColumnLayout(columns, selectable),
    [columns, selectable],
  );

  // Initial load (no data yet) shows a full spinner; on search/filter refetch the
  // existing rows are kept and slightly dimmed (keepPreviousData behavior).
  const isInitialLoad = loading && data.length === 0;
  const isRefetching = loading && data.length > 0;

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-surface-elevated shadow-sm">
      <div className="overflow-x-auto overscroll-x-contain [-webkit-overflow-scrolling:touch]">
        <Table
          scrollable={false}
          className={hasSizing ? "table-fixed" : undefined}
          style={hasSizing ? { minWidth: `${tableMinWidth}px` } : undefined}
        >
          {hasSizing && (
            <colgroup>
              {selectable && (
                <col style={{ width: `${SELECTABLE_COLUMN_WIDTH}px` }} />
              )}
              {columns.map((c, i) => (
                <col key={c.id ?? i} style={{ width: widthOf(c) }} />
              ))}
            </colgroup>
          )}
          <TableHeader>
            {table.getHeaderGroups().map((hg) => (
              <TableRow key={hg.id}>
                {/* w-11 = 44px, matching SELECTABLE_COLUMN_WIDTH — see
                    columnLayout.ts for why this can't be the same constant. */}
                {selectable && (
                  <TableHead className="w-11">
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
                    <TableHead
                      key={h.id}
                      className={["whitespace-nowrap", alignOf(meta?.align)]
                        .filter(Boolean)
                        .join(" ")}
                    >
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
                <TableCell colSpan={colSpan} className="p-0">
                  <EmptyState
                    size="compact"
                    title={resolvedEmptyText}
                    action={emptyAction}
                  />
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
