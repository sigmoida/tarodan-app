"use client";

import { useCallback } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";

const NO_PARAMS: readonly string[] = [];

export interface TabParamOptions {
  /** URL parameter holding the tab. Default: `tab`. */
  param?: string;
  /**
   * Parameters that belong to the previous tab and must not survive a switch
   * (e.g. a sub-tab `bucket` when the parent `tab` changes).
   */
  clearOnChange?: readonly string[];
}

/**
 * URL-synced tab state for list pages with tabs (e.g. list / ai). Reads
 * `?<param>=` (default `tab`), falling back to `defaultTab`; `setTab` writes it
 * (clearing `defaultTab` for a clean URL) and resets pagination. One source for
 * the tab pattern — nested tab bars use one call per level with their own
 * `param`.
 */
export function useTabParam(
  defaultTab: string,
  { param = "tab", clearOnChange = NO_PARAMS }: TabParamOptions = {},
): [string, (key: string) => void] {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const tab = searchParams.get(param) ?? defaultTab;

  const setTab = useCallback(
    (key: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (key === defaultTab) params.delete(param);
      else params.set(param, key);
      params.delete("page");
      clearOnChange.forEach((name) => params.delete(name));
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [searchParams, pathname, router, defaultTab, param, clearOnChange],
  );

  return [tab, setTab];
}
