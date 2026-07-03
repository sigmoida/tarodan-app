'use client';

import { useResourceList } from '@/components/list';

/** Header badge — pending-approval count pill (next to the title). Null when zero. */
export function ProductsPendingBadge() {
  const { rows } = useResourceList<any>();
  const pending = rows.filter((r) => r.status === 'pending').length;
  if (pending === 0) return null;
  return (
    <span className="whitespace-nowrap rounded-full bg-warning-500/20 px-3 py-1 text-sm font-medium text-warning-700">
      {pending} Bekleyen
    </span>
  );
}
