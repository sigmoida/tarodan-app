"use client";

import { useSyncExternalStore } from "react";

function subscribe(query: string, onChange: () => void) {
  const media = window.matchMedia(query);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}

/**
 * SSR-safe media query hook. `useSyncExternalStore` (not useState+useEffect)
 * so the real client value is applied synchronously before the browser
 * paints — a useEffect-based version renders the `false` SSR default first,
 * then flips after paint, causing a visible layout flash on every load.
 */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => subscribe(query, onChange),
    () => window.matchMedia(query).matches,
    () => false,
  );
}
