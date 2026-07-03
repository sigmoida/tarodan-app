'use client';

import { type ReactNode } from 'react';
import { PageHeader } from '@/components/admin-list';

/** List page header — title + description + right-aligned actions. */
export function ResourceListHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <PageHeader title={title} description={description}>
      {actions}
    </PageHeader>
  );
}
