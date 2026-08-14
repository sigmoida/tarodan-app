"use client";

import { MagnifyingGlassIcon } from "@heroicons/react/24/outline";
import { Input } from "@tarodan/ui";
import { useTranslations } from "next-intl";
import { useResourceList } from "@/context/ResourceListContext";
import { cn } from "@/lib/utils";

/**
 * Search box wired to the list's debounced search (Enter flushes immediately).
 *
 * Full width by default; the caller decides how much room it gets. The toolbar
 * pins it to a fixed per-breakpoint width — letting it absorb the free space
 * stretched it across the whole row on wide screens — while the attributes page
 * uses it full width inside a panel.
 */
export function ResourceListSearch({
  placeholder,
  className,
}: {
  placeholder?: string;
  className?: string;
}) {
  const t = useTranslations();
  const { search, setSearch, onSearchSubmit } = useResourceList();
  return (
    <div className={cn("relative w-full", className)}>
      <MagnifyingGlassIcon className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-subtle" />
      <Input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") onSearchSubmit();
        }}
        placeholder={placeholder ?? t("admin.shared.filterToolbar.placeholder")}
        className="pl-10"
      />
    </div>
  );
}
