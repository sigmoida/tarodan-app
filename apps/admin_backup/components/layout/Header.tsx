'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

interface HeaderProps {
  user?: {
    displayName: string;
    email: string;
  };
}

export function Header({ user }: HeaderProps) {
  const router = useRouter();
  const [showDropdown, setShowDropdown] = useState(false);

  const handleLogout = () => {
    localStorage.removeItem('admin_token');
    localStorage.removeItem('admin_user');
    router.push('/login');
  };

  return (
    <header className="h-16 bg-card border-b border-border flex items-center justify-between px-6">
      {/* Search */}
      <div className="flex-1 max-w-md">
        <div className="relative">
          <input
            type="search"
            placeholder="Ara..."
            className="w-full pl-10 pr-4 py-2 bg-muted rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
            🔍
          </span>
        </div>
      </div>

      {/* Right side */}
      <div className="flex items-center gap-4">
        {/* Notifications */}
        <button className="relative p-2 hover:bg-muted rounded-lg">
          <span className="text-xl">🔔</span>
          <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full" />
        </button>

        {/* User menu */}
        <div className="relative">
          <button
            onClick={() => setShowDropdown(!showDropdown)}
            className="flex items-center gap-2 p-2 hover:bg-muted rounded-lg"
          >
            <div className="w-8 h-8 bg-primary/20 rounded-full flex items-center justify-center text-primary font-medium">
              {user?.displayName?.charAt(0) || 'A'}
            </div>
            <span className="text-sm font-medium">
              {user?.displayName || 'Admin'}
            </span>
            <span>▼</span>
          </button>

          {showDropdown && (
            <div className="absolute right-0 mt-2 w-48 bg-card border border-border rounded-lg shadow-lg py-1 z-50">
              <div className="px-4 py-2 border-b border-border">
                <p className="font-medium">{user?.displayName}</p>
                <p className="text-xs text-muted-foreground">{user?.email}</p>
              </div>
              <Link
                href="/settings"
                className="block px-4 py-2 text-sm hover:bg-muted"
                onClick={() => setShowDropdown(false)}
              >
                ⚙️ Ayarlar
              </Link>
              <button
                onClick={handleLogout}
                className="w-full text-left px-4 py-2 text-sm text-red-400 hover:bg-muted"
              >
                🚪 Çıkış Yap
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

export default Header;
