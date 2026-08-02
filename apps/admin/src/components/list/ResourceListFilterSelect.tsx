"use client";

import { Select, type SelectOption } from "@tarodan/ui";
import { useResourceList } from "@/context/ResourceListContext";
import { cn } from "@/lib/utils";

/** A filter dropdown bound to `filters[name]` — changing it resets the page. */
export function ResourceListFilterSelect({
  name,
  options,
  placeholder,
  className,
}: {
  name: string;
  options: SelectOption[];
  placeholder?: string;
  className?: string;
}) {
  const { filters, setFilter } = useResourceList();
  return (
    <Select
      value={filters[name] ?? ""}
      onChange={(e) => setFilter(name, e.target.value)}
      options={options}
      placeholder={placeholder}
      className={cn(
        "w-44 min-w-32 max-w-56 shrink overflow-hidden whitespace-nowrap",
        "[&>span:first-child]:min-w-0 [&>span:first-child]:truncate",
        className,
      )}
    />
  );
}
