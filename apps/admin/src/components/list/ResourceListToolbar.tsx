'use client';

import { type ReactNode } from 'react';

/**
 * Layout for the search box + page-specific filters. Stacks on mobile; on wider
 * screens the filters sit next to the search and wrap gracefully when they don't
 * fit (the search keeps a min width).
 */
export function ResourceListToolbar({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">{children}</div>
  );
}
