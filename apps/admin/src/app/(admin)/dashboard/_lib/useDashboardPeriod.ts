"use client";

import { useCallback, useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { DashboardPeriod } from "@tarodan/types";
import {
  readPeriodParams,
  writePeriodParams,
  type DashboardPeriodSelection,
} from "./periodParams";

/**
 * URL-synced dashboard period (`?period=&from=&to=`), so a filtered dashboard
 * survives a reload and can be shared as a link — the same contract as
 * `useTabParam`. Only complete, valid selections are written, so whatever the
 * URL says is always something the API can answer.
 */
export function useDashboardPeriod(): [
  DashboardPeriodSelection,
  (selection: DashboardPeriodSelection) => void,
] {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const selection = useMemo(
    () => readPeriodParams(new URLSearchParams(searchParams.toString())),
    [searchParams],
  );

  const setSelection = useCallback(
    (next: DashboardPeriodSelection) => {
      const params = writePeriodParams(
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

export type { DashboardPeriod, DashboardPeriodSelection };
