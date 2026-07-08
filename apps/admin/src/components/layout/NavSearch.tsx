'use client';

import { Input } from '@tarodan/ui';
import { MagnifyingGlassIcon } from '@heroicons/react/24/outline';

/** Sidebar menu search box. */
export function NavSearch({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="px-3 pt-3 pb-2 border-b border-border-subtle shrink-0">
      <Input
        type="search"
        placeholder="Menüde ara…"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        leftAdornment={<MagnifyingGlassIcon className="h-4 w-4 text-subtle" aria-hidden />}
        inputSize="sm"
        className="text-sm"
        aria-label="Sol menüde başlık ara"
        autoComplete="off"
      />
    </div>
  );
}
