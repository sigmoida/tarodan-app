'use client';

import { type ReactNode } from 'react';
import { BulkActionBar } from '@/components/AdminList';
import { useResourceList } from '@/context/ResourceListContext';

/** Shows the selected-count bar with bulk action buttons when rows are selected. */
export function ResourceListBulkBar({ children }: { children: ReactNode }) {
  const { selection } = useResourceList();
  return (
    <BulkActionBar count={selection.selectedIds.length} onClear={selection.clear}>
      {children}
    </BulkActionBar>
  );
}
