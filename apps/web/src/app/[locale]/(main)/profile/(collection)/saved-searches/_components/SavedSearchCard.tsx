/** @format */

"use client";

import { MagnifyingGlassIcon, TrashIcon } from "@heroicons/react/24/outline";
import { Badge, Button, IconButton } from "@tarodan/ui";
import type { SavedSearch } from "@tarodan/types";
import { useLocale, useTranslations } from "next-intl";
import { formatDate } from "@/lib/format";
import { useListingFiltersQuery } from "@/app/[locale]/(main)/(catalog)/listings/_hooks/useListingFiltersQuery";
import { savedSearchChips } from "../_lib/chips";

export default function SavedSearchCard({
  search,
  onDelete,
  onRun,
}: {
  search: SavedSearch;
  onDelete: (search: SavedSearch) => void;
  onRun: (search: SavedSearch) => void;
}) {
  const t = useTranslations();
  const locale = useLocale();
  // The listings filter catalog (one shared, long-lived query) names the colours.
  const colorOptions = useListingFiltersQuery().data?.colors;
  const chips = savedSearchChips(search, t, locale, colorOptions);

  return (
    <div className="rounded-lg border border-border bg-surface-elevated p-6">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <h3 className="mb-2 text-lg font-semibold text-heading">
            {search.name ?? t("savedSearch.untitled")}
          </h3>
          {chips.length > 0 && (
            <div className="mb-3 flex flex-wrap gap-2">
              {chips.map((chip, i) => (
                <Badge key={`${i}:${chip}`} variant="outline" size="sm">
                  {chip}
                </Badge>
              ))}
            </div>
          )}
          <p className="text-sm text-muted">
            {t("savedSearch.savedOn", { date: formatDate(search.createdAt) })}
          </p>
        </div>

        <div className="ml-4 flex items-center gap-2">
          <IconButton
            variant="danger"
            aria-label={t("savedSearch.deleteTitle")}
            onClick={() => onDelete(search)}
          >
            <TrashIcon className="h-5 w-5" />
          </IconButton>
        </div>
      </div>

      <div className="mt-4 border-t border-border-subtle pt-4">
        <Button
          variant="primary"
          className="w-full gap-2"
          onClick={() => onRun(search)}
        >
          <MagnifyingGlassIcon className="h-5 w-5" />
          {t("search.runThisSearch")}
        </Button>
      </div>
    </div>
  );
}
