"use client";

import { type ReactNode } from "react";
import { ArrowDownTrayIcon } from "@heroicons/react/24/outline";
import { useTranslations } from "next-intl";
import { useResourceList } from "@/context/ResourceListContext";
import { columnsToCsv, hasExportableColumns } from "@/lib/csv";
import { downloadBlob } from "@/lib/download";
import { cn } from "@/lib/utils";
import { ResourceListSearch } from "./ResourceListSearch";
import { ToolbarActionButton } from "./ToolbarActionButton";
import { ResourceListFilters } from "./filters/ResourceListFilters";

/**
 * The row above every table: search on the left, then the export and filter
 * actions on the right (filter last). The toolbar owns the whole layout — pages
 * pass at most a search placeholder — because leaving it to callers is exactly
 * what produced the per-page width patches this replaced.
 *
 * Responsive shape: from `sm` up it is one row with a fixed-width search box and
 * right-aligned icon buttons; below that, search takes the full width and the
 * two actions split the row underneath as icon + label buttons.
 *
 * The table registers its columns on the context (via DataTable), so CSV export
 * works on every list without per-page wiring; it exports the loaded rows.
 */
export function ResourceListToolbar({
  searchPlaceholder,
  children,
  className,
}: {
  searchPlaceholder?: string;
  /** Escape hatch for extra controls, rendered between search and the actions. */
  children?: ReactNode;
  className?: string;
}) {
  const t = useTranslations();
  const { rows, exportRef, exportRowsRef, exportName } = useResourceList();

  const onExport = () => {
    const columns = exportRef.current;
    if (!hasExportableColumns(columns)) return;
    // Tabloya basılan (map'lenmiş) satırlar varsa CSV onları kullanır — grup
    // satırlı listelerde ham API satırları kolon şekliyle uyuşmaz (boş CSV).
    const exportRows = exportRowsRef.current.length
      ? exportRowsRef.current
      : rows;
    const date = new Date().toISOString().slice(0, 10);
    downloadBlob(
      `${exportName}_${date}.csv`,
      columnsToCsv(columns, exportRows),
      "text/csv;charset=utf-8;",
    );
  };

  return (
    <div
      className={cn(
        "flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center",
        className,
      )}
    >
      <ResourceListSearch
        placeholder={searchPlaceholder}
        className="sm:w-64 sm:shrink-0 md:w-72 lg:w-80"
      />
      {children}
      <div className="flex gap-2 sm:ml-auto sm:shrink-0">
        <ToolbarActionButton
          label={t("admin.shared.table.exportCsv")}
          icon={<ArrowDownTrayIcon className="h-4 w-4" />}
          onClick={onExport}
          disabled={rows.length === 0}
        />
        <ResourceListFilters />
      </div>
    </div>
  );
}
