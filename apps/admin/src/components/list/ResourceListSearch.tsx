"use client";

import { MagnifyingGlassIcon } from "@heroicons/react/24/outline";
import { Input } from "@tarodan/ui";
import { useResourceList } from "@/context/ResourceListContext";
import { cn } from "@/lib/utils";

/**
 * Search box wired to the list's debounced search (Enter flushes immediately).
 * Placeholder is a fixed "Ara..." across all lists. It grows into available
 * toolbar space and shrinks aggressively down to 160px before filters give up
 * any of their width.
 */
export function ResourceListSearch({
  placeholder = "Ara...",
  className,
}: {
  placeholder?: string;
  className?: string;
}) {
  const { search, setSearch, onSearchSubmit } = useResourceList();
  return (
    <div className={cn("relative min-w-40 flex-[1_100_20rem]", className)}>
      <MagnifyingGlassIcon className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-subtle" />
      <Input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") onSearchSubmit();
        }}
        placeholder={placeholder}
        className="pl-10"
      />
    </div>
  );
}
