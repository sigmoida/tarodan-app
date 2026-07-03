'use client';

import { Select, type SelectOption } from '@tarodan/ui';
import { useResourceList } from './context';

/** A filter dropdown bound to `filters[name]` — changing it resets the page. */
export function ResourceListFilterSelect({
  name,
  options,
  placeholder,
  className,
}: {
  name: string;
  options: SelectOption[];
  placeholder?: string;
  className?: string;
}) {
  const { filters, setFilter } = useResourceList();
  return (
    <Select
      value={filters[name] ?? ''}
      onChange={(e) => setFilter(name, e.target.value)}
      options={options}
      placeholder={placeholder}
      className={className}
    />
  );
}
