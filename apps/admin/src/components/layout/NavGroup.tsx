'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import clsx from 'clsx';
import { Button, IconButton } from '@tarodan/ui';
import { ChevronDownIcon, ChevronRightIcon } from '@heroicons/react/24/outline';
import type { NavGroup as NavGroupType } from '@/lib/navigation';
import { NavLink } from './NavLink';

/**
 * A collapsible sidebar section. When the group has an `href` (a section route),
 * the label navigates there and a separate chevron toggles the accordion;
 * otherwise the whole header is the toggle.
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
        <div className="flex items-center">
          <Link
            href={group.href}
            onClick={onNavigate}
            className={clsx(
              'flex flex-1 items-center min-w-0 rounded-lg px-3 py-2 text-sm font-semibold transition-colors',
              hasActive
                ? 'text-primary-600'
                : 'text-muted hover:bg-surface-alt hover:text-heading',
            )}
          >
            {icon}
            <span className="truncate">{group.name}</span>
          </Link>
          <IconButton
            aria-label={isOpen ? 'Daralt' : 'Genişlet'}
            variant="ghost"
            size="sm"
            aria-expanded={isOpen}
            onClick={onToggle}
          >
            {chevron}
          </IconButton>
        </div>
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
