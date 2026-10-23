"use client";

import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

/**
 * False on the server and during hydration, true afterwards (and on every
 * render of a component mounted after hydration). A client island renders
 * what the server rendered until this flips, then switches to what only the
 * browser knows (the viewer, the persisted guest cart), so the first client
 * render matches the server HTML and React reports no hydration mismatch.
 * No effect and no extra render for components mounted later.
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}
