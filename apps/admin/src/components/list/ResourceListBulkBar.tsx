"use client";

import { type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@tarodan/ui";
import { useResourceList } from "@/context/ResourceListContext";

/** Shows the selected-count bar with bulk action buttons when rows are selected. */
export function ResourceListBulkBar({ children }: { children: ReactNode }) {
  const { selection } = useResourceList();
  const t = useTranslations();

  if (selection.selectedIds.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-primary-200 bg-primary-50 px-4 py-2">
      <span className="text-sm font-medium text-body">
        {t("admin.shared.bulkActionBar.selectedCount", {
          count: selection.selectedIds.length,
        })}
      </span>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
      <Button
        variant="ghost"
        size="sm"
        onClick={selection.clear}
        className="ml-auto text-muted hover:text-body"
      >
        {t("admin.shared.bulkActionBar.clearSelection")}
      </Button>
    </div>
  );
}
