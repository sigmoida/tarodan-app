/** @format */

import type { ReactNode } from "react";

/**
 * The single marketplace page wrapper — one source of truth for the full-height
 * page frame. List pages (listings, collections, …) render through this so the
 * min-height + base surface live in one place.
 */
export function PageShell({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`space-y-4 min-h-dvh bg-surface ${className ? ` ${className}` : ""}`}
    >
      {children}
    </div>
  );
}
