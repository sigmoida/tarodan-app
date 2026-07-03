'use client';

import { IconButton } from '@tarodan/ui';
import { Bars3Icon } from '@heroicons/react/24/outline';
import { Breadcrumbs } from './Breadcrumbs';
import { AdminProfileMenu } from './AdminProfileMenu';

/** Sticky top bar: mobile menu trigger + breadcrumb trail + account menu. */
export function Topbar({ onOpenSidebar }: { onOpenSidebar: () => void }) {
  return (
    <header className="sticky top-0 z-30 h-16 gap-3 bg-surface-elevated/95 backdrop-blur border-b border-border flex items-center justify-between px-4 shadow-sm">
      <div className="flex items-center gap-3 min-w-0">
        <IconButton aria-label="Menüyü aç" className="lg:hidden" onClick={onOpenSidebar}>
          <Bars3Icon className="h-6 w-6" />
        </IconButton>
        <div className="hidden sm:flex min-w-0">
          <Breadcrumbs />
        </div>
      </div>

      <AdminProfileMenu />
    </header>
  );
}
