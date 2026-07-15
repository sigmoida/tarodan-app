"use client";

import { Spinner } from "@tarodan/ui";

/**
 * Full-screen loading state for auth transitions (signing in / signing out),
 * where a route change is in flight and the page would otherwise flash blank.
 *
 * - `overlay` renders it `fixed inset-0` on top of the current page (used while
 *   the login page redirects, so the form stays covered until the target paints).
 * - Without `overlay` it fills the viewport in normal flow (used by the dedicated
 *   `/logout` screen).
 */
export function TransitionLoader({
  message,
  overlay = false,
}: {
  message?: string;
  overlay?: boolean;
}) {
  return (
    <div
      className={
        overlay
          ? "fixed inset-0 z-[100] flex items-center justify-center bg-surface"
          : "flex min-h-screen items-center justify-center bg-surface"
      }
    >
      <div className="flex flex-col items-center gap-4">
        <Spinner size="xl" />
        {message && <p className="text-sm text-muted">{message}</p>}
      </div>
    </div>
  );
}
