'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import clsx from 'clsx';
import type { NavItem } from '@/lib/navigation';

/** A single sidebar link. Highlights when the current route is under its href. */
export function NavLink({
  item,
  nested = false,
  onNavigate,
}: {
  item: NavItem;
  nested?: boolean;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const isActive = pathname.startsWith(item.href);

  return (
    <Link
      href={item.href}
      scroll={false}
      onClick={onNavigate}
      className={clsx(
        'flex items-center rounded-lg text-sm font-medium transition-colors',
        nested ? 'pl-9 pr-3 py-2' : 'px-3 py-2',
        isActive
          ? 'bg-primary-50 text-primary-600'
          : 'text-muted hover:bg-surface-alt hover:text-heading',
      )}
    >
      <item.icon className="h-5 w-5 flex-shrink-0 mr-3" />
      {item.name}
    </Link>
  );
}
