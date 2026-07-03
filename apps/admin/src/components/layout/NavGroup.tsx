'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import clsx from 'clsx';
import { Button } from '@tarodan/ui';
import { ChevronDownIcon, ChevronRightIcon } from '@heroicons/react/24/outline';
import type { NavGroup as NavGroupType } from '@/lib/navigation';
import { NavLink } from './NavLink';

/**
 * A collapsible sidebar section. The whole header is a single clickable item:
 * when the group has an `href` (a section route) clicking it navigates there AND
 * toggles the accordion; otherwise it just toggles. Never a separate button.
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

  const icon = <group.icon className="h-5 w-5 mr-3 flex-shrink-0" />;
  const chevron = isOpen ? (
    <ChevronDownIcon className="h-4 w-4 flex-shrink-0" />
  ) : (
    <ChevronRightIcon className="h-4 w-4 flex-shrink-0" />
  );

  const nested = isOpen && (
    <div className="mt-1 space-y-1">
      {group.items.map((item) => (
        <NavLink key={item.href} item={item} nested onNavigate={onNavigate} />
      ))}
    </div>
  );

  if (group.href) {
    return (
      <div>
        <Link
          href={group.href}
          aria-expanded={isOpen}
          onClick={() => {
            onToggle();
            onNavigate?.();
          }}
          className={clsx(
            'flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm font-semibold transition-colors',
            hasActive
              ? 'text-primary-600'
              : 'text-muted hover:bg-surface-alt hover:text-heading',
          )}
        >
          <span className="flex min-w-0 items-center">
            {icon}
            <span className="truncate">{group.name}</span>
          </span>
          {chevron}
        </Link>
        {nested}
      </div>
    );
  }

  return (
    <div>
      <Button
        type="button"
        variant="ghost"
        onClick={onToggle}
        aria-expanded={isOpen}
        className={clsx(
          'w-full flex justify-between h-auto px-3 py-2 text-sm font-semibold',
          hasActive ? 'text-primary-600' : 'text-muted',
        )}
      >
        <span className="flex items-center min-w-0 whitespace-nowrap">
          {icon}
          <span className="truncate">{group.name}</span>
        </span>
        {chevron}
      </Button>
      {nested}
    </div>
  );
}
