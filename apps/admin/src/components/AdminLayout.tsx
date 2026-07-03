'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import clsx from 'clsx';
import { Button, Input } from '@tarodan/ui';
import { useSession } from '@/lib/session-context';
import { useIdleLogout } from '@/hooks/useIdleLogout';
import { useRouteGuard } from '@/hooks/useRouteGuard';
import { useSidebar } from '@/hooks/useSidebar';
import { useVisibleNav } from '@/hooks/useVisibleNav';
import { useNavSearch } from '@/hooks/useNavSearch';
import { useNavGroups } from '@/hooks/useNavGroups';
import { AdminProfileMenu } from '@/components/AdminProfileMenu';
import { type NavItem } from '@/lib/navigation';
import {
  Bars3Icon,
  XMarkIcon,
  MagnifyingGlassIcon,
  ChevronDownIcon,
  ChevronRightIcon,
} from '@heroicons/react/24/outline';

interface AdminLayoutProps {
  children: React.ReactNode;
}

export default function AdminLayout({ children }: AdminLayoutProps) {
  const pathname = usePathname();
  const { user, logout } = useSession();

  // 1 saat hareketsizlikte otomatik logout (Balanced politika).
  useIdleLogout();
  // Route guard (UX) — izinler sunucudan otoriter geldiği için anlık ve yarışsız.
  useRouteGuard();

  const { open: sidebarOpen, openSidebar, closeSidebar } = useSidebar();
  const { topNav: visibleTopNav, groups: visibleGroups } = useVisibleNav();
  const {
    query: navQuery,
    setQuery: setNavQuery,
    isSearching,
    results: searchResults,
  } = useNavSearch(visibleTopNav, visibleGroups);
  const { openGroups, toggleGroup } = useNavGroups(pathname);

  const handleLogout = () => {
    // logout() cookie'leri sunucuda temizler ve /login'e yönlendirir.
    void logout();
  };

  const renderNavLink = (item: NavItem, opts?: { nested?: boolean }) => {
    const isActive = pathname.startsWith(item.href);
    return (
      <Link
        key={item.href}
        href={item.href}
        scroll={false}
        className={clsx(
          'flex items-center rounded-lg text-sm font-medium transition-colors',
          opts?.nested ? 'pl-9 pr-3 py-2' : 'px-3 py-2.5',
          isActive
            ? 'bg-primary-50 text-primary-600'
            : 'text-muted hover:bg-surface-alt hover:text-heading'
        )}
        onClick={closeSidebar}
      >
        <item.icon className={clsx('h-5 w-5 flex-shrink-0', opts?.nested ? 'mr-2.5' : 'mr-3')} />
        {item.name}
      </Link>
    );
  };

  return (
    <div className="min-h-screen bg-surface">
      {/* Mobile sidebar backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-heading/30 lg:hidden"
          onClick={closeSidebar}
        />
      )}

      {/* Sidebar */}
      <aside
        className={clsx(
          'fixed inset-y-0 left-0 z-50 w-64 bg-surface-elevated border-r border-border transform transition-transform duration-300 lg:translate-x-0 flex flex-col shadow-soft',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        {/* Logo */}
        <div className="h-16 flex items-center justify-between px-4 border-b border-border">
          <Link href="/dashboard" scroll={false} className="flex items-center">
            <Image
              src="/tarodan-logo.jpg"
              alt="Tarodan Logo"
              width={120}
              height={40}
              className="object-contain"
              style={{ width: 'auto', height: 'auto', maxWidth: '100%', maxHeight: '40px' }}
              priority
            />
            <span className="ml-2 text-xs text-muted font-medium">Admin</span>
          </Link>
          <Button variant="secondary" className="lg:hidden text-subtle hover:text-body"
            onClick={closeSidebar}>
            <XMarkIcon className="h-6 w-6" />
          </Button>
        </div>

        <div className="px-3 pt-3 pb-2 border-b border-border-subtle shrink-0">
          <Input
            type="search"
            placeholder="Menüde ara…"
            value={navQuery}
            onChange={(e) => setNavQuery(e.target.value)}
            leftAdornment={<MagnifyingGlassIcon className="h-4 w-4 text-subtle" aria-hidden />}
            inputSize="sm"
            className="text-sm"
            aria-label="Sol menüde başlık ara"
            autoComplete="off"
          />
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-3 pt-2 space-y-1 overflow-y-auto min-h-0">
          {isSearching ? (
            searchResults.length === 0 ? (
              <p className="px-3 py-4 text-sm text-muted text-center">Eşleşen menü öğesi yok</p>
            ) : (
              searchResults.map((item) => renderNavLink(item))
            )
          ) : (
            <>
              {visibleTopNav.map((item) => renderNavLink(item))}

              <div className="h-2" />

              {visibleGroups.map((group) => {
                const isOpen = openGroups.has(group.id);
                const hasActive = group.items.some((item) => pathname.startsWith(item.href));
                return (
                  <div key={group.id}>
                    <button
                      type="button"
                      onClick={() => toggleGroup(group.id)}
                      aria-expanded={isOpen}
                      className={clsx(
                        'w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-semibold uppercase tracking-wide transition-colors',
                        hasActive
                          ? 'text-primary-600'
                          : 'text-muted hover:bg-surface-alt hover:text-heading'
                      )}
                    >
                      <span className="flex items-center min-w-0 whitespace-nowrap">
                        <group.icon className="h-4 w-4 mr-2.5 flex-shrink-0" />
                        <span className="truncate">{group.name}</span>
                      </span>
                      {isOpen ? (
                        <ChevronDownIcon className="h-4 w-4 flex-shrink-0" />
                      ) : (
                        <ChevronRightIcon className="h-4 w-4 flex-shrink-0" />
                      )}
                    </button>
                    {isOpen && (
                      <div className="mt-1 space-y-1">
                        {group.items.map((item) => renderNavLink(item, { nested: true }))}
                      </div>
                    )}
                  </div>
                );
              })}
            </>
          )}
        </nav>

      </aside>

      {/* Main content */}
      <div className="lg:pl-64">
        {/* Top bar */}
        <header className="sticky top-0 z-30 h-16 bg-surface-elevated/95 backdrop-blur border-b border-border flex items-center justify-between px-4 shadow-sm">
          <div className="flex items-center">
            <Button variant="secondary" className="lg:hidden text-muted hover:text-body mr-4"
              onClick={openSidebar}>
              <Bars3Icon className="h-6 w-6" />
            </Button>
          </div>
          <div className="flex items-center space-x-4">
            <AdminProfileMenu user={user} onLogout={handleLogout} />
          </div>
        </header>

        {/* Page content */}
        <main className="p-6">{children}</main>
      </div>
    </div>
  );
}
