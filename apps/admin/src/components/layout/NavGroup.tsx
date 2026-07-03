'use client';

import { usePathname } from 'next/navigation';
import clsx from 'clsx';
import { Button } from '@tarodan/ui';
import { ChevronDownIcon, ChevronRightIcon } from '@heroicons/react/24/outline';
import type { NavGroup as NavGroupType } from '@/lib/navigation';
import { NavLink } from './NavLink';

/**
 * A collapsible sidebar section. The header is a toggle-only control — clicking
 * it just expands/collapses the accordion (no navigation, even for groups with a
 * section `href`); the child NavLinks handle navigation. This keeps route-redirect
 * parents from re-navigating (and re-opening) on every click.
 */
export function NavGroup({
  group,
  isOpen,
  onToggle,
  onNavigate,
}: {
  group: NavGroupType;
  isOpen: boolean;
  onToggle: () => void;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const hasActive = group.items.some((item) => pathname.startsWith(item.href));

  const chevron = isOpen ? (
    <ChevronDownIcon className="h-4 w-4 flex-shrink-0" />
  ) : (
    <ChevronRightIcon className="h-4 w-4 flex-shrink-0" />
  );

  return (
    <div>
      <Button
        type="button"
        variant="ghost"
        onClick={onToggle}
        aria-expanded={isOpen}
        className={clsx(
          'h-auto w-full justify-between px-3 py-2 text-sm font-semibold',
          hasActive
            ? 'text-primary-600'
            : 'text-muted hover:bg-surface-alt hover:text-heading',
        )}
      >
        <span className="flex min-w-0 items-center whitespace-nowrap">
          <group.icon className="mr-3 h-5 w-5 flex-shrink-0" />
          <span className="truncate">{group.name}</span>
        </span>
        {chevron}
      </Button>
      {isOpen && (
        <div className="mt-1 space-y-1">
          {group.items.map((item) => (
            <NavLink key={item.href} item={item} nested onNavigate={onNavigate} />
          ))}
        </div>
      )}
    </div>
  );
}
