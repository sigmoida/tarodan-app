'use client';

import { type ReactNode } from 'react';
import Link from 'next/link';
import { ChevronLeftIcon } from '@heroicons/react/24/outline';
import { EmptyState } from '@tarodan/ui';
import { SuspenseBoundary } from '@/components/page/SuspenseBoundary';
import { useAdminItem } from '@/hooks/useAdminItem';

export interface DetailPageProps<T> {
  /** Resource + id + fetcher — DetailPage owns the fetch (suspends until ready). */
  resource: string;
  id: string;
  fetcher: (id: string) => Promise<T>;
  /** Back link — usually the resource list. */
  backHref: string;
  backLabel?: string;
  emptyTitle?: string;
  /** Header slots + body — render-props receiving the loaded item. */
  title?: (item: T) => ReactNode;
  subtitle?: (item: T) => ReactNode;
  badge?: (item: T) => ReactNode;
  actions?: (item: T) => ReactNode;
  children: (item: T) => ReactNode;
}

/**
 * Shared shell for admin detail (`[id]`) pages. The whole page shows one spinner
 * until the item loads (via SuspenseBoundary); on error the boundary shows a
 * retry. The chevron-back sits inline before the title.
 */
export function DetailPage<T>(props: DetailPageProps<T>) {
  return (
    <SuspenseBoundary>
      <DetailPageInner {...props} />
    </SuspenseBoundary>
  );
}

function DetailPageInner<T>({
  resource,
  id,
  fetcher,
  backHref,
  backLabel = 'Geri',
  emptyTitle = 'Kayıt bulunamadı',
  title,
  subtitle,
  badge,
  actions,
  children,
}: DetailPageProps<T>) {
  const { item } = useAdminItem<T>({ resource, id, fetcher });

  const backLink = (
    <Link
      href={backHref}
      aria-label={backLabel}
      title={backLabel}
      className="-ml-1 mt-1 rounded-lg p-1 text-muted transition-colors hover:bg-surface-alt hover:text-heading"
    >
      <ChevronLeftIcon className="h-6 w-6" />
    </Link>
  );

  if (item == null) {
    return (
      <div className="space-y-6">
        <div className="flex items-start gap-2">{backLink}</div>
        <EmptyState title={emptyTitle} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {(title || badge || actions) && (
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 items-start gap-2">
            {backLink}
            <div className="min-w-0">
              {title && (
                <div className="flex flex-wrap items-center gap-3">
                  <h1 className="text-2xl font-bold text-heading">{title(item)}</h1>
                  {badge && badge(item)}
                </div>
              )}
              {subtitle && <p className="mt-1 text-muted">{subtitle(item)}</p>}
            </div>
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions(item)}</div>}
        </div>
      )}
      {children(item)}
    </div>
  );
}
