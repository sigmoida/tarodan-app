"use client";

import { useCallback, useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  readRangeParams,
  writeRangeParams,
  type AnalyticsRangeSelection,
} from "./rangeParams";

/**
 * URL-synced analytics range (`?from=&to=&groupBy=&compare=`), the same
 * contract as `useTabParam` and the dashboard's period filter — so the tab and
 * the range live in the same URL and a filtered screen is shareable.
 */
export function useAnalyticsRange(): [
  AnalyticsRangeSelection,
  (selection: AnalyticsRangeSelection) => void,
] {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const selection = useMemo(
    () => readRangeParams(new URLSearchParams(searchParams.toString())),
    [searchParams],
  );

  const setSelection = useCallback(
    (next: AnalyticsRangeSelection) => {
      const params = writeRangeParams(
        new URLSearchParams(searchParams.toString()),
        next,
      );
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  return [selection, setSelection];
}
