'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  ArrowRightOnRectangleIcon,
  UserCircleIcon,
  ChevronDownIcon,
} from '@heroicons/react/24/outline';

/** Tek kaynak: hesap menüsü linkleri burada tanımlanır. */
const PROFILE_MENU_ITEMS: Array<{ label: string; href: string }> = [];

interface ProfileUser {
  displayName?: string | null;
  email?: string | null;
}

interface AdminProfileMenuProps {
  user: ProfileUser | null;
  onLogout: () => void;
}

/**
 * Admin header'daki "Hesabım" dropdown menüsünün TEK ortak karşılığı.
 * Yeni bir hesap linki eklemek için yalnızca PROFILE_MENU_ITEMS güncellenir.
 */
export function AdminProfileMenu({ user, onLogout }: AdminProfileMenuProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 px-3 py-2 rounded-lg text-muted hover:text-heading hover:bg-surface-alt transition-colors"
      >
        <UserCircleIcon className="h-5 w-5 shrink-0" />
        <span className="hidden sm:inline text-sm">Hesabım</span>
        <ChevronDownIcon className="h-4 w-4 shrink-0" />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-50 mt-2 w-60 overflow-hidden rounded-lg border border-border bg-surface-elevated py-1 shadow-elevated">
            <div className="border-b border-border px-4 py-3">
              <p className="truncate text-sm font-medium text-heading">
                {user?.displayName || 'Yönetici'}
              </p>
              <p className="truncate text-xs text-muted">{user?.email}</p>
            </div>

            {PROFILE_MENU_ITEMS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                scroll={false}
                onClick={() => setOpen(false)}
                className="flex items-center gap-2 px-4 py-2 text-sm text-muted hover:bg-surface-alt hover:text-heading"
              >
                {item.label}
              </Link>
            ))}

            <button
              onClick={() => {
                setOpen(false);
                onLogout();
              }}
              className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-danger-600 hover:bg-danger-500/10"
            >
              <ArrowRightOnRectangleIcon className="h-4 w-4 shrink-0" />
              Çıkış Yap
            </button>
          </div>
        </>
      )}
    </div>
  );
}
