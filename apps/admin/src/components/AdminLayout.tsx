'use client';

import { useEffect, useMemo, useState, type ComponentType } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/stores/authStore';
import { useIdleLogout } from '@/hooks/useIdleLogout';
import { adminApi } from '@/lib/api';
import clsx from 'clsx';
import { Button, Input } from '@tarodan/ui';
import { AdminProfileMenu } from '@/components/AdminProfileMenu';
import {
  HomeIcon,
  UsersIcon,
  ShoppingBagIcon,
  ClipboardDocumentListIcon,
  ChartBarIcon,
  Cog6ToothIcon,

  Bars3Icon,
  XMarkIcon,
  CurrencyDollarIcon,
  UserCircleIcon,
  ChatBubbleLeftRightIcon,
  SwatchIcon,
  // KUPON/İndirimler sekmesi devre dışı (yoruma alındı)
  // TicketIcon,
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
  FlagIcon,
  BeakerIcon,
} from '@heroicons/react/24/outline';

type NavItem = {
  name: string;
  href: string;
  icon: ComponentType<{ className?: string }>;
  /** Ek arama kelimeleri (ör. İngilizce route, eş anlamlı) */
  keywords?: string[];
  /**
   * Bu öğeyi göstermek için gerekli izin anahtarı (rol izin matrisinden).
   * Belirtilmezse `roles` dizisine fallback yapılır.
   */
  permission?: string;
  /** Fallback: izin sistemi yüklenemezse bu roller kontrol edilir. Belirtilmezse super_admin + admin. */
  roles?: string[];
};

type NavGroup = {
  id: string;
  name: string;
  icon: ComponentType<{ className?: string }>;
  items: NavItem[];
};

const topLevelNav: NavItem[] = [
  { name: 'Dashboard', href: '/dashboard', icon: HomeIcon, keywords: ['ana sayfa', 'home'], permission: 'dashboard' },
  { name: 'Analizler', href: '/analytics', icon: ChartBarIcon, keywords: ['istatistik', 'rapor'], permission: 'analytics' },
];

const navGroups: NavGroup[] = [
  {
    id: 'operations',
    name: 'Operasyon',
    icon: ClipboardDocumentIcon,
    items: [
      { name: 'Siparişler', href: '/orders', icon: ClipboardDocumentListIcon, keywords: ['order'], permission: 'orders' },
      { name: 'Takaslar', href: '/trades', icon: ArrowsRightLeftIcon, keywords: ['takas', 'trade', 'barter', 'değişim'], permission: 'trades' },
      { name: 'Kargo', href: '/shipping', icon: TruckIcon, keywords: ['kargo', 'shipping', 'gönderi', 'etiket', 'takip'], permission: 'shipping' },
      { name: 'İade Talepleri', href: '/refund-requests', icon: BanknotesIcon, keywords: ['iade', 'refund', 'talep'], permission: 'refund_requests' },
      { name: 'İade Geçmişi', href: '/refunds', icon: BanknotesIcon, keywords: ['iade', 'refund', 'geçmiş'], permission: 'refund_history' },
    ],
  },
  {
    id: 'catalog',
    name: 'Katalog',
    icon: Squares2X2Icon,
    items: [
      { name: 'Ürünler', href: '/products', icon: ShoppingBagIcon, permission: 'products' },
      { name: 'Kategoriler', href: '/categories', icon: CubeIcon, permission: 'categories' },
      { name: 'Markalar', href: '/brands', icon: SwatchIcon, permission: 'brands' },
      { name: 'Modeller', href: '/car-models', icon: TruckIcon, permission: 'car_models' },
      { name: 'Üreticiler', href: '/manufacturers', icon: BuildingOffice2Icon, permission: 'manufacturers' },
      { name: 'Ürün Özellikleri', href: '/attributes', icon: ClipboardDocumentListIcon, keywords: ['attribute', 'özellik'], permission: 'attributes' },
      { name: 'Koleksiyonlar', href: '/collections', icon: ClipboardDocumentCheckIcon, permission: 'collections' },
    ],
  },
  {
    id: 'users',
    name: 'Hesaplar',
    icon: UsersIcon,
    items: [
      { name: 'Kullanıcılar', href: '/users', icon: UsersIcon, keywords: ['user', 'üye'], permission: 'users' },
      { name: 'Satıcı Başvuruları', href: '/sellers/applications', icon: ClipboardDocumentCheckIcon, permission: 'seller_applications' },
      { name: 'Satıcı Performansı', href: '/sellers/performance', icon: ChartBarIcon, permission: 'seller_performance' },
      { name: 'Yorumlar', href: '/reviews', icon: StarIcon, permission: 'reviews' },
      { name: 'Rapor Talepleri', href: '/reports', icon: FlagIcon, keywords: ['rapor', 'şikayet', 'report', 'complaint', 'abuse'], permission: 'reports' },
      { name: 'Rol Yönetimi', href: '/roles', icon: UserCircleIcon, permission: 'staff' },
    ],
  },
  {
    id: 'messaging',
    name: 'Mesajlaşma',
    icon: ChatBubbleLeftRightIcon,
    items: [
      { name: 'Mesajlar', href: '/messages', icon: ChatBubbleLeftRightIcon, permission: 'messages' },
      { name: 'Destek Talepleri', href: '/support', icon: ChatBubbleLeftRightIcon, keywords: ['destek', 'support', 'ticket'], permission: 'support' },
    ],
  },
  {
    id: 'marketing',
    name: 'Pazarlama & İçerik',
    icon: MegaphoneIcon,
    items: [
      // KUPON/İndirimler sekmesi devre dışı (yoruma alındı) — sayfa kodu ve route duruyor
      // { name: 'İndirimler', href: '/discounts', icon: TicketIcon, permission: 'discounts' },
      { name: 'Reklamlar', href: '/ads', icon: MegaphoneIcon, keywords: ['reklam', 'ad', 'banner'], permission: 'ads' },
      { name: 'Bildirimler', href: '/notifications', icon: BellAlertIcon, permission: 'notifications' },
      { name: 'E-posta Şablonları', href: '/email-templates', icon: ChatBubbleLeftRightIcon, permission: 'email_templates' },
      { name: 'Sayfalar', href: '/pages', icon: DocumentTextIcon, permission: 'pages' },
    ],
  },
  {
    id: 'finance',
    name: 'Finans',
    icon: CurrencyDollarIcon,
    items: [
      { name: 'Ödemeler', href: '/payments', icon: CreditCardIcon, keywords: ['ödeme', 'payment', 'hold'], permission: 'payments' },
      { name: 'Komisyon', href: '/commission', icon: CurrencyDollarIcon, permission: 'commission' },
      { name: 'Satıcı Ödemeleri', href: '/payouts', icon: BanknotesIcon, permission: 'payouts' },
      { name: 'Vergi Ayarları', href: '/tax', icon: CalculatorIcon, permission: 'tax' },
    ],
  },
  {
    id: 'system',
    name: 'Sistem',
    icon: Cog6ToothIcon,
    items: [
      { name: 'AI Denetim', href: '/ai-moderation', icon: ClipboardDocumentCheckIcon, keywords: ['ai', 'moderasyon', 'nsfw'], permission: 'ai_moderation' },
      { name: 'Üyelik Katmanları', href: '/membership-tiers', icon: StarIcon, keywords: ['üyelik', 'membership', 'tier'], permission: 'membership_tiers' },
      { name: 'Sistem Ayarları', href: '/settings', icon: Cog6ToothIcon, permission: 'settings' },
      { name: 'Loglar', href: '/logs', icon: ClipboardDocumentIcon, keywords: ['log', 'hata', 'error', 'güvenlik', 'e-posta', 'audit', 'denetim', 'iz', 'değişiklik', 'security'], permission: 'logs' },
      { name: 'Test Araçları', href: '/test-tools', icon: BeakerIcon, keywords: ['test', 'zaman', 'cron', 'süre', 'boost', 'üyelik', 'iade', 'time'], permission: 'test_tools', roles: ['super_admin'] },
    ],
  },
];

const OPEN_GROUPS_STORAGE_KEY = 'admin-nav-open-groups';

/** Sayfa path'i → gerekli izin. Spesifik path'ler önce gelir. */
const ROUTE_PERMISSIONS: [string, string][] = [
  ['/sellers/applications', 'seller_applications'],
  ['/sellers/performance', 'seller_performance'],
  ['/analytics', 'analytics'],
  ['/orders', 'orders'],
  ['/trades', 'trades'],
  ['/shipping', 'shipping'],
  ['/refund-requests', 'refund_requests'],
  ['/refunds', 'refund_history'],
  ['/test-tools', 'test_tools'],
  ['/products', 'products'],
  ['/categories', 'categories'],
  ['/brands', 'brands'],
  ['/car-models', 'car_models'],
  ['/manufacturers', 'manufacturers'],
  ['/attributes', 'attributes'],
  ['/collections', 'collections'],
  ['/users', 'users'],
  ['/reviews', 'reviews'],
  ['/reports', 'reports'],
  ['/roles', 'staff'],
  ['/messages', 'messages'],
  ['/support', 'support'],
  ['/discounts', 'discounts'],
  ['/ads', 'ads'],
  ['/notifications', 'notifications'],
  ['/email-templates', 'email_templates'],
  ['/pages', 'pages'],
  ['/payments', 'payments'],
  ['/commission', 'commission'],
  ['/payouts', 'payouts'],
  ['/tax', 'tax'],
  ['/ai-moderation', 'ai_moderation'],
  ['/moderation', 'ai_moderation'],
  ['/membership-tiers', 'membership_tiers'],
  ['/settings', 'settings'],
  ['/logs', 'logs'],
  ['/audit-logs', 'audit_logs'],
];

function matchesQuery(item: NavItem, q: string): boolean {
  const name = item.name.toLocaleLowerCase('tr-TR');
  const href = item.href.toLowerCase();
  if (name.includes(q) || href.includes(q)) return true;
  return (item.keywords ?? []).some((k) => k.toLocaleLowerCase('tr-TR').includes(q));
}


interface AdminLayoutProps {
  children: React.ReactNode;
}

/**
 * Yükleme tamamlanana kadar kullanılan varsayılan izinler.
 * Backend DEFAULT_ROLE_PERMISSIONS ile senkron tutulmalı.
 */
const NAV_FALLBACK_PERMS: Record<string, string[]> = {
  super_admin: ['dashboard'],
  admin: [
    'dashboard', 'analytics',
    'orders', 'trades', 'shipping', 'refund_requests', 'refund_history',
    'products', 'categories', 'brands', 'car_models', 'manufacturers', 'attributes', 'collections',
    'users', 'seller_applications', 'seller_performance', 'reviews', 'reports',
    'payments', 'commission', 'payouts',
    'messages', 'support', 'discounts', 'ads', 'notifications', 'email_templates', 'pages',
    'ai_moderation',
  ],
  moderator: [
    'dashboard', 'products', 'users', 'reviews', 'reports', 'messages', 'support', 'trades', 'ai_moderation',
  ],
};


export default function AdminLayout({ children }: AdminLayoutProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuthStore();
  // 1 saat hareketsizlikte otomatik logout (Balanced politika).
  useIdleLogout();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [navQuery, setNavQuery] = useState('');

  /**
   * Rol → izin listesi.
   * Başlangıç değeri NAV_FALLBACK_PERMS: API yanıt verene kadar doğru nav görünür.
   * API'den gelen veri gelince override edilir.
   */
  const [rolePerms, setRolePerms] = useState<Record<string, string[]>>(NAV_FALLBACK_PERMS);
  // İzinler API'den yüklendi mi? Yüklenmeden route guard çalışmaz (false-redirect önlemi).
  const [permissionsLoaded, setPermissionsLoaded] = useState(false);

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

  // Her oturumda rol izinlerini API'den taze yükle (cache yok → stale nav olmaz).
  useEffect(() => {
    if (!user) return;
    if (user.role === 'super_admin') {
      setPermissionsLoaded(true);
      return;
    }

    adminApi.getRolePermissions()
      .then((res) => {
        const data = res.data;
        if (!data || typeof data !== 'object') return;
        const merged: Record<string, string[]> = { ...NAV_FALLBACK_PERMS };
        for (const [r, perms] of Object.entries(data)) {
          if (Array.isArray(perms) && perms.length > 0) merged[r] = perms;
        }
        setRolePerms(merged);
      })
      .catch(() => {})
      .finally(() => setPermissionsLoaded(true));
  }, [user?.role]); // eslint-disable-line react-hooks/exhaustive-deps

  // Route guard: izin yoksa /dashboard'a yönlendir.
  useEffect(() => {
    if (!user || user.role === 'super_admin' || !permissionsLoaded) return;
    const currentPerms = rolePerms[user.role] ?? [];
    const match = ROUTE_PERMISSIONS.find(([prefix]) => pathname.startsWith(prefix));
    if (match && !currentPerms.includes(match[1])) {
      router.replace('/dashboard');
    }
  }, [pathname, user, rolePerms, permissionsLoaded, router]);

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

  // Menüyü kullanıcının rolüne + yüklenen izin matrisine göre filtrele.
  const role = user?.role ?? '';

  const canSee = (item: NavItem): boolean => {
    // Süper admin her şeyi görür.
    if (role === 'super_admin') return true;

    // İzin matrisi yüklendiyse ve öğenin bir izin anahtarı varsa → matrisi kullan.
    if (rolePerms && item.permission) {
      return (rolePerms[role] ?? []).includes(item.permission);
    }

    // Fallback: hardcode roles dizisine bak (eski davranış / yükleme öncesi).
    return (item.roles ?? ['super_admin', 'admin']).includes(role);
  };

  const visibleTopNav = useMemo(
    () => topLevelNav.filter(canSee),
    [role, rolePerms], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const visibleGroups = useMemo(
    () =>
      navGroups
        .map((g) => ({ ...g, items: g.items.filter(canSee) }))
        .filter((g) => g.items.length > 0),
    [role, rolePerms], // eslint-disable-line react-hooks/exhaustive-deps
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
