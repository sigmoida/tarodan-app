'use client';

import Link from 'next/link';
import {
  IconButton,
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@tarodan/ui';
import { ArrowRightStartOnRectangleIcon, UserCircleIcon } from '@heroicons/react/24/outline';
import { useSession } from '@/lib/session-context';

/** Tek kaynak: hesap menüsü linkleri burada tanımlanır. */
const PROFILE_MENU_ITEMS: Array<{ label: string; href: string }> = [];

/**
 * Icon-only account menu in the top bar. Built on the shared DropdownMenu +
 * IconButton; reads the current admin straight from the session context.
 */
export function AdminProfileMenu() {
  const { user, logout } = useSession();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <IconButton aria-label="Hesap menüsü">
          <UserCircleIcon className="h-6 w-6" />
        </IconButton>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-60">
        <div className="px-2 py-1.5">
          <p className="truncate text-sm font-medium text-heading">
            {user.displayName || 'Yönetici'}
          </p>
          <p className="truncate text-xs text-muted">{user.email}</p>
        </div>

        <DropdownMenuSeparator />

        {PROFILE_MENU_ITEMS.map((item) => (
          <DropdownMenuItem key={item.href} asChild>
            <Link href={item.href} scroll={false}>
              {item.label}
            </Link>
          </DropdownMenuItem>
        ))}
        {PROFILE_MENU_ITEMS.length > 0 && <DropdownMenuSeparator />}

        <DropdownMenuItem danger onSelect={() => logout()}>
          <ArrowRightStartOnRectangleIcon className="h-4 w-4 shrink-0" />
          Çıkış Yap
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
