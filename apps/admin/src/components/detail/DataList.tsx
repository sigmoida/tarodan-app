import { type ReactNode } from "react";
import { cn } from "@tarodan/ui";

const COLUMNS = {
  1: "grid-cols-1",
  2: "grid-cols-1 sm:grid-cols-2",
  3: "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3",
} as const;

/** A responsive definition grid for `label: value` detail rows. */
export function DataList({
  children,
  columns = 2,
  className,
}: {
  children: ReactNode;
  columns?: keyof typeof COLUMNS;
  className?: string;
}) {
  return (
    <dl
      className={cn(
        "grid gap-x-6 gap-y-3 text-sm",
        COLUMNS[columns],
        className,
      )}
    >
      {children}
    </dl>
  );
}

/**
 * One `label: value` row. `inline` (default): label left, value right-aligned
 * and emphasized. `stacked`: small label on top, value below.
 */
export function Field({
  label,
  children,
  layout = "inline",
  mono,
}: {
  label: ReactNode;
  children: ReactNode;
  layout?: "inline" | "stacked";
  mono?: boolean;
}) {
  if (layout === "stacked") {
    return (
      <div>
        <dt className="text-xs text-muted">{label}</dt>
        <dd className={cn("mt-0.5 text-heading", mono && "font-mono")}>
          {children}
        </dd>
      </div>
    );
  }
  return (
    <div className="flex items-center justify-between gap-2">
      <dt className="text-muted">{label}</dt>
      <dd
        className={cn(
          "text-right font-medium text-heading",
          mono && "font-mono",
        )}
      >
        {children}
      </dd>
    </div>
  );
}
