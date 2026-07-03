'use client';

import { IconButton } from '@tarodan/ui';
import { Bars3Icon } from '@heroicons/react/24/outline';
import { useSession } from '@/lib/session-context';
import { AdminProfileMenu } from '@/components/AdminProfileMenu';

/** Sticky top bar: mobile menu trigger + account menu. */
export function Topbar({ onOpenSidebar }: { onOpenSidebar: () => void }) {
  const { user, logout } = useSession();

  return (
    <header className="sticky top-0 z-30 h-16 bg-surface-elevated/95 backdrop-blur border-b border-border flex items-center justify-between px-4 shadow-sm">
      {/* Left cell keeps the account menu right-aligned even when the trigger is hidden on lg+. */}
      <div className="flex items-center">
        <IconButton aria-label="Menüyü aç" className="lg:hidden" onClick={onOpenSidebar}>
          <Bars3Icon className="h-6 w-6" />
        </IconButton>
      </div>
      <div className="flex items-center space-x-4">
        <AdminProfileMenu user={user} onLogout={() => void logout()} />
      </div>
    </header>
  );
}
