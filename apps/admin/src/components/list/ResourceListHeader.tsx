'use client';

import { type ReactNode } from 'react';
import { PageHeader } from '@/components/AdminList';
import { AdminTabs, type AdminTab } from '@/components/AdminTabs';

/**
 * List page header — the single header used by every list page: title + optional
 * badge (next to title) + description + right-aligned actions, and an optional
 * tab bar directly below. No page should hand-roll its own `<h1>`/tabs.
 */
export function ResourceListHeader({
  title,
  badge,
  description,
  actions,
  tabs,
  activeTab,
  onTabChange,
}: {
  title: ReactNode;
  badge?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  tabs?: AdminTab[];
  activeTab?: string;
  onTabChange?: (key: string) => void;
}) {
  return (
    <div className="space-y-4">
      <PageHeader title={title} badge={badge} description={description}>
        {actions}
      </PageHeader>
      {tabs && activeTab != null && onTabChange && (
        <AdminTabs tabs={tabs} value={activeTab} onChange={onTabChange} />
      )}
    </div>
  );
}
