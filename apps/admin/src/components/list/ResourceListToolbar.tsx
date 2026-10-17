"use client";

import { type ReactNode } from "react";
import { useResourceList } from "@/context/ResourceListContext";
import { cn } from "@/lib/utils";
import { ResourceListSearch } from "./ResourceListSearch";
import { ResourceListFilters } from "./filters/ResourceListFilters";

/**
 * The row above every table: search on the left, then the filter action on
 * the right. The toolbar owns the whole layout — pages pass at most a search
 * placeholder — because leaving it to callers is exactly what produced the
 * per-page width patches this replaced. A server-side Excel export is an
 * `ExportButton` passed as a child.
 *
 * Responsive shape: from `sm` up it is one row with a fixed-width search box and
 * right-aligned icon button; below that, search takes the full width and the
 * action splits the row underneath as an icon + label button.
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
  const { isPristineEmpty } = useResourceList();

  // Kayıt yok ve hiçbir arama/filtre daraltmıyor: aranacak, süzülecek ya da
  // dışa aktarılacak bir şey yok — yalnız boş durum kartı görünür.
  if (isPristineEmpty) return null;

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
        <ResourceListFilters />
      </div>
    </div>
  );
}
