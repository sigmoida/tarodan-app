'use client';

import { useTranslations } from 'next-intl';
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
  const t = useTranslations();
  return (
    <div className="px-3 pt-3 pb-2 border-b border-border-subtle shrink-0">
      <Input
        type="search"
        placeholder={t('admin.shared.navSearch.placeholder')}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        leftAdornment={<MagnifyingGlassIcon className="h-4 w-4 text-subtle" aria-hidden />}
        inputSize="sm"
        className="text-sm"
        aria-label={t('admin.shared.navSearch.ariaLabel')}
        autoComplete="off"
      />
    </div>
  );
}
