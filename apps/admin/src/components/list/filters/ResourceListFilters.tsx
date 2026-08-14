"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { FunnelIcon } from "@heroicons/react/24/outline";
import { Badge } from "@tarodan/ui";
import { useResourceList } from "@/context/ResourceListContext";
import { ToolbarActionButton } from "@/components/list/ToolbarActionButton";
import { FilterDialog } from "./FilterDialog";
import { countActiveFilters } from "./schema";

/**
 * The toolbar's filter trigger: a funnel button carrying the active-filter
 * count, plus the dialog it opens. Renders nothing when the list declares no
 * filter schema.
 */
export function ResourceListFilters() {
  const t = useTranslations();
  const { filterFields, baseFilters, filters, setFilters } = useResourceList();
  const [open, setOpen] = useState(false);

  if (filterFields.length === 0) return null;

  const active = countActiveFilters(filterFields, filters, baseFilters);

  return (
    <>
      <ToolbarActionButton
        label={t("admin.shared.filterDialog.open")}
        icon={<FunnelIcon className="h-4 w-4" />}
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
        badge={
          active > 0 ? (
            <>
              <Badge
                variant="primary"
                appearance="solid"
                size="sm"
                aria-hidden
                className="ml-2 sm:absolute sm:-right-1.5 sm:-top-1.5 sm:ml-0"
              >
                {active}
              </Badge>
              <span className="sr-only">
                {t("admin.shared.filterDialog.activeCount", { count: active })}
              </span>
            </>
          ) : null
        }
      />
      {open && (
        <FilterDialog
          // Re-seed the draft if the applied filters change underneath an open
          // dialog — the Back button restores state from the URL, and a draft
          // built against the previous state would silently re-apply it.
          key={JSON.stringify(filters)}
          fields={filterFields}
          applied={filters}
          defaults={baseFilters}
          onApply={(values) => {
            setFilters(values);
            setOpen(false);
          }}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
