'use client';

import { MagnifyingGlassIcon } from '@heroicons/react/24/outline';
import { Input } from '@tarodan/ui';
import { useResourceList } from './context';

/**
 * Search box wired to the list's debounced search (Enter flushes immediately).
 * Placeholder is a fixed "Ara..." across all lists; grows to fill the toolbar
 * row and keeps a min width so page-specific filters wrap beside it.
 */
export function ResourceListSearch({ placeholder = 'Ara...' }: { placeholder?: string }) {
  const { search, setSearch, onSearchSubmit } = useResourceList();
  return (
    <div className="relative flex-1 sm:min-w-56">
      <MagnifyingGlassIcon className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-subtle" />
      <Input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') onSearchSubmit();
        }}
        placeholder={placeholder}
        className="pl-10"
      />
    </div>
  );
}
