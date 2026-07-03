'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronRightIcon } from '@heroicons/react/24/outline';
import { breadcrumbsFor } from '@/lib/navigation';

/**
 * Parent → child trail for the current route, built from the nav config.
 * Rendered locally (not the shared @tarodan/ui Breadcrumb, which is also used by
 * the web app with dark-on-light colors) so it can use light text on the primary
 * top bar. Non-current crumbs are clickable; the last is the current page.
 */
export function Breadcrumbs() {
  const pathname = usePathname();
  const crumbs = breadcrumbsFor(pathname);
  if (crumbs.length === 0) return null;

  return (
    <nav aria-label="Breadcrumb" className="flex items-center text-sm text-inverted">
      <ol className="flex flex-wrap items-center gap-1">
        {crumbs.map((crumb, i) => {
          const isLast = i === crumbs.length - 1;
          return (
            <li key={i} className="flex items-center gap-1">
              {isLast || !crumb.href ? (
                <span
                  aria-current={isLast ? 'page' : undefined}
                  className={isLast ? 'font-semibold' : 'text-inverted/80'}
                >
                  {crumb.label}
                </span>
              ) : (
                <Link
                  href={crumb.href}
                  scroll={false}
                  className="text-inverted/80 transition-colors hover:text-inverted"
                >
                  {crumb.label}
                </Link>
              )}
              {!isLast && (
                <ChevronRightIcon className="h-3.5 w-3.5 text-inverted/50" aria-hidden />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
