'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Breadcrumb } from '@tarodan/ui';
import { ChevronRightIcon } from '@heroicons/react/24/outline';
import { breadcrumbsFor } from '@/lib/navigation';

/** Typed adapter so the shared Breadcrumb can render Next.js links. */
function CrumbLink({
  href,
  className,
  children,
}: {
  href: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Link href={href} scroll={false} className={className}>
      {children}
    </Link>
  );
}

/**
 * Parent → child trail for the current route, built from the nav config.
 * Non-current crumbs are clickable; the last is the current page.
 */
export function Breadcrumbs() {
  const pathname = usePathname();
  const crumbs = breadcrumbsFor(pathname);
  if (crumbs.length === 0) return null;

  return (
    <Breadcrumb
      items={crumbs}
      linkAs={CrumbLink}
      separator={<ChevronRightIcon className="h-3.5 w-3.5" aria-hidden />}
    />
  );
}
