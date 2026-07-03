'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import { useSession } from '@/lib/session-context';
import { usePermissions } from '@/lib/permissions-context';
import { useIdleLogout } from '@/hooks/useIdleLogout';
import clsx from 'clsx';
import { Button, Input } from '@tarodan/ui';
import { AdminProfileMenu } from '@/components/AdminProfileMenu';
import {
  navGroups,
  topLevelNav,
  matchesQuery,
  routePermission,
  type NavItem,
} from '@/lib/navigation';
import {
  Bars3Icon,
  XMarkIcon,
  MagnifyingGlassIcon,
  ChevronDownIcon,
  ChevronRightIcon,
} from '@heroicons/react/24/outline';

const OPEN_GROUPS_STORAGE_KEY = 'admin-nav-open-groups';

interface AdminLayoutProps {
  children: React.ReactNode;
}

export default function AdminLayout({ children }: AdminLayoutProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useSession();
  // İzinler sunucuda çözülüp context ile hidre edildi — client fetch yok, flicker yok.
  const { can, canSee } = usePermissions();
  // 1 saat hareketsizlikte otomatik logout (Balanced politika).
  useIdleLogout();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [navQuery, setNavQuery] = useState('');

  // Aktif route hangi gruptaysa o grup otomatik açılır, son kullanıcı tercihi localStorage'da saklanır
  const activeGroupId = useMemo(() => {
    for (const g of navGroups) {
      if (g.items.some((item) => pathname.startsWith(item.href))) return g.id;
    }
    return null;
  }, [pathname]);

  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set());
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(OPEN_GROUPS_STORAGE_KEY);
      if (raw) setOpenGroups(new Set(JSON.parse(raw) as string[]));
    } catch {}
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (activeGroupId && !openGroups.has(activeGroupId)) {
      setOpenGroups((prev) => new Set(prev).add(activeGroupId));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeGroupId]);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(OPEN_GROUPS_STORAGE_KEY, JSON.stringify(Array.from(openGroups)));
    } catch {}
  }, [openGroups, hydrated]);

  // Route guard (UX): izin yoksa /dashboard'a yönlendir. İzinler sunucudan otoriter
  // geldiği için anlık ve yarışsız — gerçek yetki zaten API'de.
  useEffect(() => {
    const required = routePermission(pathname);
    if (required && !can(required)) {
      router.replace('/dashboard');
    }
  }, [pathname, can, router]);

  const toggleGroup = (id: string) => {
    setOpenGroups((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const q = navQuery.trim().toLocaleLowerCase('tr-TR');
  const isSearching = q.length > 0;

  // Menüyü kullanıcının izin setine göre filtrele (canSee context'ten gelir).
  const visibleTopNav = useMemo(() => topLevelNav.filter(canSee), [canSee]);
  const visibleGroups = useMemo(
    () =>
      navGroups
        .map((g) => ({ ...g, items: g.items.filter(canSee) }))
        .filter((g) => g.items.length > 0),
    [canSee],
  );

  // Arama aktifken: grupları yok say, tüm eşleşmeleri düz liste olarak göster
  const searchResults = useMemo(() => {
    if (!isSearching) return [] as NavItem[];
    const all = [...visibleTopNav, ...visibleGroups.flatMap((g) => g.items)];
    return all.filter((item) => matchesQuery(item, q));
  }, [isSearching, q, visibleTopNav, visibleGroups]);


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
        onClick={() => setSidebarOpen(false)}
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
          onClick={() => setSidebarOpen(false)}
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
            onClick={() => setSidebarOpen(false)}>
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
              onClick={() => setSidebarOpen(true)}>
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
