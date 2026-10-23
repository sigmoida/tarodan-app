"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";

/**
 * Selected review for the detail drawer, seeded from the `id` param of a
 * report deep link (`?tab=<kind>&id=<reviewId>`) so the drawer opens on load.
 */
export function useReviewDeepLink() {
  const searchParams = useSearchParams();
  return useState<string | null>(() => searchParams.get("id"));
}
