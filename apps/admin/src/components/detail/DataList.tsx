import { type ReactNode } from "react";
import { cn } from "@tarodan/ui";

/** A responsive definition grid for `label: value` detail rows. */
export function DataList({
  children,
  columns = 2,
  className,
}: {
  children: ReactNode;
  columns?: 1 | 2;
  className?: string;
}) {
  return (
    <dl
      className={cn(
        "grid gap-x-6 gap-y-3 text-sm",
        columns === 2 ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-1",
        className,
      )}
    >
      {children}
    </dl>
  );
}

/** One `label: value` row. Value is right-aligned and emphasized. */
export function Field({
  label,
  children,
}: {
  label: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <dt className="text-muted">{label}</dt>
      <dd className="text-right font-medium text-heading">{children}</dd>
    </div>
  );
}
