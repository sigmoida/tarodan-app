'use client';

import { useCallback } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';

/**
 * URL-synced tab state for list pages with tabs (e.g. list / ai). Reads `?tab=`,
 * falling back to `defaultTab`; `setTab` writes it (clearing `defaultTab` for a
 * clean URL) and resets pagination. One source for the tab pattern.
 */
export function useTabParam(defaultTab: string): [string, (key: string) => void] {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const tab = searchParams.get('tab') ?? defaultTab;

  const setTab = useCallback(
    (key: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (key === defaultTab) params.delete('tab');
      else params.set('tab', key);
      params.delete('page');
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [searchParams, pathname, router, defaultTab],
  );

  return [tab, setTab];
}
