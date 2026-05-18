'use client';

import { useEffect, useMemo, useState, type ComponentType } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/stores/authStore';
import clsx from 'clsx';
import { Button, Input } from '@tarodan/ui';
import {
  HomeIcon,
  UsersIcon,
  ShoppingBagIcon,
  ClipboardDocumentListIcon,
  ChartBarIcon,
  Cog6ToothIcon,
  ArrowRightOnRectangleIcon,
  Bars3Icon,
  XMarkIcon,
  CurrencyDollarIcon,
  UserCircleIcon,
  ChatBubbleLeftRightIcon,
  TagIcon,
  SwatchIcon,
  TicketIcon,
  CalculatorIcon,
  BanknotesIcon,
  DocumentTextIcon,
  TruckIcon,
  BellAlertIcon,
  CubeIcon,
  BuildingOffice2Icon,
  ClipboardDocumentCheckIcon,
  StarIcon,
  CreditCardIcon,
  ArrowsRightLeftIcon,
  MagnifyingGlassIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  MegaphoneIcon,
  Squares2X2Icon,
  ClipboardDocumentIcon,
} from '@heroicons/react/24/outline';

type NavItem = {
  name: string;
  href: string;
  icon: ComponentType<{ className?: string }>;
  /** Ek arama kelimeleri (ör. İngilizce route, eş anlamlı) */
  keywords?: string[];
};

type NavGroup = {
  id: string;
  name: string;
  icon: ComponentType<{ className?: string }>;
  items: NavItem[];
};

const topLevelNav: NavItem[] = [
  { name: 'Dashboard', href: '/dashboard', icon: HomeIcon, keywords: ['ana sayfa', 'home'] },
  { name: 'Analizler', href: '/analytics', icon: ChartBarIcon, keywords: ['istatistik', 'rapor'] },
];

const navGroups: NavGroup[] = [
  {
    id: 'operations',
    name: 'Operasyon',
    icon: ClipboardDocumentIcon,
    items: [
      { name: 'Siparişler', href: '/orders', icon: ClipboardDocumentListIcon, keywords: ['order'] },
      {
        name: 'Takaslar',
        href: '/trades',
        icon: ArrowsRightLeftIcon,
        keywords: ['takas', 'trade', 'barter', 'değişim', 'safe trade'],
      },
      {
        name: 'Takas Kargoları',
        href: '/trade-shipments',
        icon: TruckIcon,
        keywords: ['trade shipment', 'takas kargo', 'depoya', 'from warehouse'],
      },
      { name: 'Kargo', href: '/shipping', icon: TruckIcon },
      {
        name: 'İade Talepleri',
        href: '/refund-requests',
        icon: BanknotesIcon,
        keywords: ['iade', 'refund', 'request', 'dispute', 'talep'],
      },
      { name: 'İade Geçmişi', href: '/refunds', icon: BanknotesIcon, keywords: ['iade', 'refund'] },
    ],
  },
  {
    id: 'catalog',
    name: 'Katalog',
    icon: Squares2X2Icon,
    items: [
      { name: 'Ürünler', href: '/products', icon: ShoppingBagIcon },
      { name: 'Kategoriler', href: '/categories', icon: CubeIcon },
      { name: 'Markalar', href: '/brands', icon: SwatchIcon },
      { name: 'Modeller', href: '/car-models', icon: TruckIcon },
      { name: 'Üreticiler', href: '/manufacturers', icon: BuildingOffice2Icon },
      { name: 'Ürün Özellikleri', href: '/attributes', icon: ClipboardDocumentListIcon, keywords: ['attribute', 'özellik'] },
      { name: 'Koleksiyonlar', href: '/collections', icon: ClipboardDocumentCheckIcon },
      { name: 'Etiketler', href: '/tags', icon: TagIcon },
    ],
  },
  {
    id: 'users',
    name: 'Hesaplar',
    icon: UsersIcon,
    items: [
      { name: 'Kullanıcılar', href: '/users', icon: UsersIcon, keywords: ['user', 'üye'] },
      { name: 'Satıcı Başvuruları', href: '/sellers/applications', icon: ClipboardDocumentCheckIcon },
      { name: 'Satıcı Performansı', href: '/sellers/performance', icon: ChartBarIcon },
      { name: 'Yorumlar', href: '/reviews', icon: StarIcon },
      { name: 'Rol Yönetimi', href: '/roles', icon: UserCircleIcon },
    ],
  },
  {
    id: 'marketing',
    name: 'Pazarlama & İçerik',
    icon: MegaphoneIcon,
    items: [
      { name: 'İndirimler', href: '/discounts', icon: TicketIcon },
      { name: 'Bildirimler', href: '/notifications', icon: BellAlertIcon },
      { name: 'E-posta Şablonları', href: '/email-templates', icon: ChatBubbleLeftRightIcon },
      { name: 'Mesajlar', href: '/messages', icon: ChatBubbleLeftRightIcon },
      { name: 'Sayfalar', href: '/pages', icon: DocumentTextIcon },
    ],
  },
  {
    id: 'finance',
    name: 'Finans',
    icon: CurrencyDollarIcon,
    items: [
      { name: 'Komisyon', href: '/commission', icon: CurrencyDollarIcon },
      { name: 'Satıcı Ödemeleri', href: '/payouts', icon: BanknotesIcon },
      { name: 'Vergi Ayarları', href: '/tax', icon: CalculatorIcon },
      { name: 'Ödeme Ayarları', href: '/settings/payments', icon: CreditCardIcon },
    ],
  },
  {
    id: 'system',
    name: 'Sistem',
    icon: Cog6ToothIcon,
    items: [
      { name: 'Sistem Ayarları', href: '/settings', icon: Cog6ToothIcon },
      { name: 'Sistem Logları', href: '/logs', icon: ClipboardDocumentCheckIcon },
    ],
  },
];

const OPEN_GROUPS_STORAGE_KEY = 'admin-nav-open-groups';

function matchesQuery(item: NavItem, q: string): boolean {
  const name = item.name.toLocaleLowerCase('tr-TR');
  const href = item.href.toLowerCase();
  if (name.includes(q) || href.includes(q)) return true;
  return (item.keywords ?? []).some((k) => k.toLocaleLowerCase('tr-TR').includes(q));
}


interface AdminLayoutProps {
  children: React.ReactNode;
}

export default function AdminLayout({ children }: AdminLayoutProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuthStore();
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

  // Arama aktifken: grupları yok say, tüm eşleşmeleri düz liste olarak göster
  const searchResults = useMemo(() => {
    if (!isSearching) return [] as NavItem[];
    const all = [...topLevelNav, ...navGroups.flatMap((g) => g.items)];
    return all.filter((item) => matchesQuery(item, q));
  }, [isSearching, q]);

  const handleLogout = () => {
    logout();
    router.push('/login');
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
              {topLevelNav.map((item) => renderNavLink(item))}

              <div className="h-2" />

              {navGroups.map((group) => {
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

        {/* User section */}
        <div className="p-4 border-t border-border">
          <div className="flex items-center mb-3">
            <div className="w-10 h-10 rounded-full bg-primary-50 flex items-center justify-center">
              <span className="text-primary-600 font-semibold">
                {user?.displayName?.charAt(0) || 'A'}
              </span>
            </div>
            <div className="ml-3">
              <p className="text-sm font-medium text-heading">{user?.displayName}</p>
              <p className="text-xs text-muted">{user?.role}</p>
            </div>
          </div>
          <Button variant="secondary" onClick={handleLogout}
            className="flex items-center w-full px-3 py-2 rounded-lg text-sm text-muted hover:bg-danger-50 hover:text-danger-600 transition-colors">
            <ArrowRightOnRectangleIcon className="h-5 w-5 mr-3" />
            Çıkış Yap
          </Button>
        </div>
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
            <div className="hidden lg:flex items-center">
              <Image
                src="/tarodan-logo.jpg"
                alt="Tarodan Logo"
                width={100}
                height={32}
                className="object-contain"
                style={{ width: 'auto', height: 'auto', maxWidth: '100%', maxHeight: '32px' }}
              />
              <span className="ml-2 text-sm text-muted">Admin Panel</span>
            </div>
          </div>
          <div className="flex items-center space-x-4">
            <div className="hidden sm:flex items-center gap-2 text-sm">
              <span className="text-muted">{user?.email}</span>
            </div>
            <Link
              href="/settings"
              scroll={false}
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-muted hover:text-heading hover:bg-surface-alt transition-colors"
            >
              <UserCircleIcon className="h-5 w-5" />
              <span className="hidden sm:inline text-sm">Profil</span>
            </Link>
          </div>
        </header>

        {/* Page content */}
        <main className="p-6">{children}</main>
      </div>
    </div>
  );
}
