"use client";

import { type ReactNode } from "react";
import { Button } from "@tarodan/ui";
import {
  ChevronUpIcon,
  ChevronDownIcon,
  ChevronUpDownIcon,
} from "@heroicons/react/24/solid";
import { cn } from "@/lib/utils";
import {
  type CellAlign,
  type SetSort,
  type SortOrder,
  type SortType,
} from "./meta";

export interface SortableHeaderProps {
  /** Field key sent as `sortBy` and used by the client comparator. */
  sortKey: string;
  /** Comparator hint forwarded to `setSort` (client-list sorting). */
  sortType?: SortType;
  /** Whether this column is the currently active sort. */
  active: boolean;
  /** Active direction (only meaningful when `active`). */
  order?: SortOrder;
  /** Cell alignment — keeps the control in step with the column. */
  align?: CellAlign;
  onSort: SetSort;
  children: ReactNode;
}

/**
 * Clickable sort control for a `DataTable` header. Built on the design-system
 * `Button` (ghost, stripped to a bare label) so it stays keyboard/focus-accessible
 * without a raw `<button>`. Shows ▲/▼ when active, a faint ⇅ hint otherwise.
 */
export function SortableHeader({
  sortKey,
  sortType,
  active,
  order,
  align = "left",
  onSort,
  children,
}: SortableHeaderProps) {
  const Arrow = !active
    ? ChevronUpDownIcon
    : order === "desc"
      ? ChevronDownIcon
      : ChevronUpIcon;
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={() => onSort(sortKey, sortType)}
      aria-label={typeof children === "string" ? children : undefined}
      className={cn(
        "group h-auto gap-1 rounded bg-transparent px-1 -mx-1 py-0.5 font-semibold hover:bg-transparent",
        // Right-aligned columns keep the arrow visually leading the number block.
        align === "right" && "flex-row-reverse",
        active ? "text-heading" : "text-body hover:text-heading",
      )}
    >
      {/* Headers never truncate — the column's header-aware min-width guarantees
          room, so we keep them on one line without an ellipsis. */}
      <span className="whitespace-nowrap">{children}</span>
      <Arrow
        aria-hidden="true"
        className={cn(
          "h-3.5 w-3.5 shrink-0 transition-colors",
          active ? "text-primary-600" : "text-subtle",
        )}
      />
    </Button>
  );
}
