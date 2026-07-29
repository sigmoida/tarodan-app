"use client";

import { type ReactNode } from "react";
import { ArrowDownTrayIcon } from "@heroicons/react/24/outline";
import { Button } from "@tarodan/ui";
import { useTranslations } from "next-intl";
import { useResourceList } from "@/context/ResourceListContext";
import { columnsToCsv, hasExportableColumns } from "@/lib/csv";
import { downloadBlob } from "@/lib/download";
import { cn } from "@/lib/utils";

/**
 * Layout for the search box + page-specific filters, plus a CSV export button
 * pinned to the right of the same row. The table registers its columns on the
 * context (via DataTable), so the export works on every list without per-page
 * wiring; it downloads the currently loaded rows.
 */
export function ResourceListToolbar({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const t = useTranslations();
  const { rows, exportRef, exportName } = useResourceList();

  const onExport = () => {
    const columns = exportRef.current;
    if (!hasExportableColumns(columns)) return;
    const date = new Date().toISOString().slice(0, 10);
    downloadBlob(
      `${exportName}_${date}.csv`,
      columnsToCsv(columns, rows),
      "text/csv;charset=utf-8;",
    );
  };

  return (
    <div
      className={cn(
        "flex min-w-0 flex-nowrap items-start gap-3 overflow-x-auto pb-1",
        className,
      )}
    >
      {children}
      <Button
        variant="outline"
        leftIcon={<ArrowDownTrayIcon className="h-4 w-4" />}
        onClick={onExport}
        disabled={rows.length === 0}
        className="ml-auto shrink-0"
      >
        {t("admin.shared.table.exportCsv")}
      </Button>
    </div>
  );
}
