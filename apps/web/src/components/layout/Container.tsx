/** @format */

import type { ReactNode } from "react";

/**
 * The single max-width boundary for the marketplace shell. Content is full-bleed
 * until the cap below, then fixed + centered so it never stretches on ultra-wide
 * screens. Both the (main) content area and the navbar header render through this
 * so the width lives in ONE place — change it here and the whole shell follows.
 *
 * Kept dependency-free (no `@tarodan/ui` barrel import) so it stays usable from
 * Server Components like `(main)/layout.tsx` without dragging client components
 * into the server module graph.
 */
export function Container({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={`px-4 mx-auto w-full max-w-screen-2xl ${className ? ` ${className}` : ""}`}
    >
      {children}
    </div>
  );
}
