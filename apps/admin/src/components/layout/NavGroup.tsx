'use client';

import { usePathname } from 'next/navigation';
import clsx from 'clsx';
import { Button } from '@tarodan/ui';
import { ChevronDownIcon, ChevronRightIcon } from '@heroicons/react/24/outline';
import type { NavGroup as NavGroupType } from '@/lib/navigation';
import { NavLink } from './NavLink';

/** A collapsible sidebar section: a toggle header + its nested links. */
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
          <group.icon className="h-5 w-5 mr-3 flex-shrink-0" />
          <span className="truncate">{group.name}</span>
        </span>
        {isOpen ? (
          <ChevronDownIcon className="h-4 w-4 flex-shrink-0" />
        ) : (
          <ChevronRightIcon className="h-4 w-4 flex-shrink-0" />
        )}
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
