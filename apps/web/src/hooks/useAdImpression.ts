/** @format */

"use client";

import type { RefObject } from "react";
import { trackAdEvent } from "@/lib/api/advertisements";
import { useVisibilityImpression } from "./useVisibilityImpression";

/** Afiş gösterimi: görünürlük kuralı `useVisibilityImpression`da. */
export function useAdImpression(
  ref: RefObject<Element | null>,
  adId: string,
  enabled = true,
): void {
  useVisibilityImpression(ref, () => trackAdEvent(adId, "impression"), enabled);
}
