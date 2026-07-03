'use client';

import { Input } from '@tarodan/ui';
import { useFilter } from './context';

/** A from/to date-range filter pair bound to two filter keys. */
export function ResourceListDateRange({
  fromName = 'startDate',
  toName = 'endDate',
}: {
  fromName?: string;
  toName?: string;
}) {
  const [from, setFrom] = useFilter(fromName);
  const [to, setTo] = useFilter(toName);
  return (
    <div className="flex gap-3">
      <Input
        type="date"
        value={from}
        onChange={(e) => setFrom(e.target.value)}
        className="flex-1 sm:w-40 sm:flex-none"
        aria-label="Başlangıç tarihi"
      />
      <Input
        type="date"
        value={to}
        onChange={(e) => setTo(e.target.value)}
        className="flex-1 sm:w-40 sm:flex-none"
        aria-label="Bitiş tarihi"
      />
    </div>
  );
}
