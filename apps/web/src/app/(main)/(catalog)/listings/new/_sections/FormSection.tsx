/** @format */

import type { ReactNode } from "react";

/** The shared card frame for a new-listing form section: surface + border +
 *  a small uppercase heading. */
export function FormSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="bg-surface-elevated rounded border border-border-subtle p-5">
      <h2 className="text-sm font-semibold text-heading uppercase tracking-wide mb-4">
        {title}
      </h2>
      {children}
    </div>
  );
}
