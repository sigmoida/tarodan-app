'use client';

import { type ReactNode } from 'react';
import { EmptyState } from '@tarodan/ui';
import { SuspenseBoundary } from '@/components/page/SuspenseBoundary';
import { AdminPage } from '@/components/page/AdminPage';
import { PageHeader } from '@/components/AdminList';
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
 * Shared shell for admin detail (`[id]`) pages. Same AdminPage + PageHeader shell
 * as the list pages — so the title size/position matches everywhere — with the
 * PageHeader back chevron enabled. The whole page shows one spinner until the
 * item loads (via SuspenseBoundary); on error the boundary shows a retry.
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

  if (item == null) {
    return (
      <AdminPage>
        <PageHeader title={emptyTitle} backHref={backHref} backLabel={backLabel} />
        <EmptyState title={emptyTitle} />
      </AdminPage>
    );
  }

  return (
    <AdminPage>
      <PageHeader
        title={title?.(item)}
        badge={badge?.(item)}
        description={subtitle?.(item)}
        backHref={backHref}
        backLabel={backLabel}
      >
        {actions?.(item)}
      </PageHeader>
      {children(item)}
    </AdminPage>
  );
}
