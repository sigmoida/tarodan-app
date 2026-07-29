"use client";

import { type ReactNode } from "react";
import { DataTable, type ColumnDef } from "@/components/DataTable";
import { useResourceList } from "@/context/ResourceListContext";

/** The table — reads rows/loading/selection from context; columns are its prop. */
export function ResourceListTable<T>({
  columns,
  onRowClick,
  rowClassName,
  renderExpanded,
  expandedId,
  emptyText,
  emptyAction,
}: {
  columns: ColumnDef<T, any>[];
  onRowClick?: (row: T) => void;
  rowClassName?: (row: T) => string | undefined;
  renderExpanded?: (row: T) => ReactNode;
  expandedId?: string | null;
  emptyText?: string;
  emptyAction?: ReactNode;
}) {
  const { rows, isLoading, getRowId, selection, sort, setSort } =
    useResourceList<T>();
  return (
    <DataTable
      columns={columns}
      data={rows}
      loading={isLoading}
      getRowId={getRowId}
      onRowClick={onRowClick}
      rowClassName={rowClassName}
      renderExpanded={renderExpanded}
      expandedId={expandedId}
      emptyText={emptyText}
      emptyAction={emptyAction}
      selectable={selection.selectable}
      selectedIds={selection.selectedIds}
      onToggleRow={selection.toggleRow}
      onToggleAll={selection.toggleAll}
      sort={sort}
      onSort={setSort}
    />
  );
}
