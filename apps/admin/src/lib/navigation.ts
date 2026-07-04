import type { ComponentType } from 'react';
import {
  HomeIcon,
  UsersIcon,
  ShoppingBagIcon,
  ClipboardDocumentListIcon,
  ChartBarIcon,
  Cog6ToothIcon,
  CurrencyDollarIcon,
  UserCircleIcon,
  ChatBubbleLeftRightIcon,
  SwatchIcon,
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
  MegaphoneIcon,
  Squares2X2Icon,
  ClipboardDocumentIcon,
  FlagIcon,
  BeakerIcon,
  TicketIcon,
} from '@heroicons/react/24/outline';

/**
 * The single source for the admin left menu. The nav data lives here
 * (data ≠ component); shell components consume it. The route→permission mapping
 * is also derived from here (`routePermission`) — no separate list is kept.
 */

export type NavItem = {
  name: string;
  href: string;
  icon: ComponentType<{ className?: string }>;
  /** Extra search terms (e.g. English route, synonyms) */
  keywords?: string[];
  /**
   * Permission key required to show this item (from the role permission matrix).
   * Falls back to the `roles` array when not specified.
   */
  permission?: string;
  /** Fallback: these roles are checked if the permission system fails to load. Defaults to super_admin + admin. */
  roles?: string[];
};

export type NavGroup = {
  id: string;
  name: string;
  icon: ComponentType<{ className?: string }>;
  items: NavItem[];
  /**
   * Optional section route. When set, clicking the group header navigates here
   * (the route redirects to the first child) while the chevron toggles the
   * accordion. Groups without an href are toggle-only.
   */
  href?: string;
};

export const topLevelNav: NavItem[] = [
  { name: 'Dashboard', href: '/dashboard', icon: HomeIcon, keywords: ['ana sayfa', 'home'], permission: 'dashboard' },
  { name: 'Analizler', href: '/analytics', icon: ChartBarIcon, keywords: ['istatistik', 'rapor'], permission: 'analytics' },
];

export const navGroups: NavGroup[] = [
  {
    id: 'operations',
    name: 'Operasyon',
    icon: ClipboardDocumentIcon,
    href: '/operations',
    items: [
      { name: 'Siparişler', href: '/operations/orders', icon: ClipboardDocumentListIcon, keywords: ['order'], permission: 'orders' },
      { name: 'Takaslar', href: '/operations/trades', icon: ArrowsRightLeftIcon, keywords: ['takas', 'trade', 'barter', 'değişim'], permission: 'trades' },
      { name: 'Kargo', href: '/operations/shipping', icon: TruckIcon, keywords: ['kargo', 'shipping', 'gönderi', 'etiket', 'takip'], permission: 'shipping' },
      { name: 'İade Takibi', href: '/operations/refund-requests', icon: BanknotesIcon, keywords: ['iade', 'refund', 'talep', 'takip'], permission: 'refund_requests' },
      { name: 'İade Geçmişi', href: '/operations/refunds', icon: BanknotesIcon, keywords: ['iade', 'refund', 'geçmiş'], permission: 'refund_history' },
    ],
  },
  {
    id: 'catalog',
    name: 'Katalog',
    icon: Squares2X2Icon,
    href: '/catalog',
    items: [
      { name: 'Ürünler', href: '/catalog/products', icon: ShoppingBagIcon, permission: 'products' },
      { name: 'Kategoriler', href: '/catalog/categories', icon: CubeIcon, permission: 'categories' },
      { name: 'Markalar', href: '/catalog/brands', icon: SwatchIcon, permission: 'brands' },
      { name: 'Modeller', href: '/catalog/car-models', icon: TruckIcon, permission: 'car_models' },
      { name: 'Üreticiler', href: '/catalog/manufacturers', icon: BuildingOffice2Icon, permission: 'manufacturers' },
      { name: 'Ürün Özellikleri', href: '/catalog/attributes', icon: ClipboardDocumentListIcon, keywords: ['attribute', 'özellik'], permission: 'attributes' },
      { name: 'Koleksiyonlar', href: '/catalog/collections', icon: ClipboardDocumentCheckIcon, permission: 'collections' },
    ],
  },
  {
    id: 'users',
    name: 'Hesaplar',
    icon: UsersIcon,
    href: '/accounts',
    items: [
      { name: 'Kullanıcılar', href: '/accounts/users', icon: UsersIcon, keywords: ['user', 'üye'], permission: 'users' },
      { name: 'Satıcı Başvuruları', href: '/accounts/seller-applications', icon: ClipboardDocumentCheckIcon, permission: 'seller_applications' },
      { name: 'Satıcı Performansı', href: '/accounts/seller-performance', icon: ChartBarIcon, permission: 'seller_performance' },
      { name: 'Yorumlar', href: '/accounts/reviews', icon: StarIcon, permission: 'reviews' },
      { name: 'Rapor Talepleri', href: '/accounts/reports', icon: FlagIcon, keywords: ['rapor', 'şikayet', 'report', 'complaint', 'abuse'], permission: 'reports' },
      { name: 'Rol Yönetimi', href: '/accounts/roles', icon: UserCircleIcon, permission: 'staff' },
    ],
  },
  {
    id: 'messaging',
    name: 'Mesajlaşma',
    icon: ChatBubbleLeftRightIcon,
    href: '/messaging',
    items: [
      { name: 'Mesajlar', href: '/messaging/messages', icon: ChatBubbleLeftRightIcon, permission: 'messages' },
      { name: 'Destek Talepleri', href: '/messaging/support', icon: ChatBubbleLeftRightIcon, keywords: ['destek', 'support', 'ticket'], permission: 'support' },
    ],
  },
  {
    id: 'marketing',
    name: 'Pazarlama & İçerik',
    icon: MegaphoneIcon,
    href: '/marketing',
    items: [
      { name: 'Reklamlar', href: '/marketing/ads', icon: MegaphoneIcon, keywords: ['reklam', 'ad', 'banner'], permission: 'ads' },
      { name: 'İndirimler', href: '/marketing/discounts', icon: TicketIcon, keywords: ['indirim', 'kupon', 'discount', 'coupon', 'kampanya'], permission: 'discounts' },
      { name: 'Bildirimler', href: '/marketing/notifications', icon: BellAlertIcon, permission: 'notifications' },
      { name: 'E-posta Şablonları', href: '/marketing/email-templates', icon: ChatBubbleLeftRightIcon, permission: 'email_templates' },
      { name: 'Sayfalar', href: '/marketing/pages', icon: DocumentTextIcon, permission: 'pages' },
    ],
  },
  {
    id: 'finance',
    name: 'Finans',
    icon: CurrencyDollarIcon,
    href: '/finance',
    items: [
      { name: 'Ödemeler', href: '/finance/payments', icon: CreditCardIcon, keywords: ['ödeme', 'payment', 'hold'], permission: 'payments' },
      { name: 'Komisyon', href: '/finance/commission', icon: CurrencyDollarIcon, permission: 'commission' },
      { name: 'Satıcı Ödemeleri', href: '/finance/payouts', icon: BanknotesIcon, permission: 'payouts' },
      { name: 'Faturalar', href: '/finance/invoices', icon: DocumentTextIcon, keywords: ['fatura', 'invoice', 'e-arşiv', 'e-fatura', 'elogo', 'iade faturası'], permission: 'invoices' },
      { name: 'Vergi Ayarları', href: '/finance/tax', icon: CalculatorIcon, permission: 'tax' },
    ],
  },
  {
    id: 'system',
    name: 'Sistem',
    icon: Cog6ToothIcon,
    href: '/system',
    items: [
      { name: 'AI Denetim', href: '/system/ai-moderation', icon: ClipboardDocumentCheckIcon, keywords: ['ai', 'moderasyon', 'nsfw'], permission: 'ai_moderation' },
      { name: 'Üyelik Katmanları', href: '/system/membership-tiers', icon: StarIcon, keywords: ['üyelik', 'membership', 'tier'], permission: 'membership_tiers' },
      { name: 'Sistem Ayarları', href: '/system/settings', icon: Cog6ToothIcon, permission: 'settings' },
      { name: 'Loglar', href: '/system/logs', icon: ClipboardDocumentIcon, keywords: ['log', 'hata', 'error', 'güvenlik', 'e-posta', 'audit', 'denetim', 'iz', 'değişiklik', 'security'], permission: 'logs' },
      { name: 'Test Araçları', href: '/system/test-tools', icon: BeakerIcon, keywords: ['test', 'zaman', 'cron', 'süre', 'boost', 'üyelik', 'iade', 'time'], permission: 'test_tools', roles: ['super_admin'] },
    ],
  },
];

/** Whether a nav item matches a search query (name/href/keywords). */
export function matchesQuery(item: NavItem, q: string): boolean {
  const name = item.name.toLocaleLowerCase('tr-TR');
  const href = item.href.toLowerCase();
  if (name.includes(q) || href.includes(q)) return true;
  return (item.keywords ?? []).some((k) => k.toLocaleLowerCase('tr-TR').includes(q));
}

/**
 * Routes that don't appear in the nav but still need guarding (aliases /
 * disabled tabs). Exceptions that can't be derived from the nav items go here.
 */
const EXTRA_ROUTE_PERMISSIONS: Record<string, string> = {
  // Route exceptions that can't be derived from the nav go here. Currently all are defined in the nav.
};

/**
 * Route→permission map. Derived from the nav items' `permission` field + the
 * exceptions above. Dashboard is deliberately EXCLUDED: it's always accessible
 * (it's also the guard's redirect target — avoid a loop).
 */
const ROUTE_PERMISSIONS: Record<string, string> = (() => {
  const map: Record<string, string> = {};
  const add = (items: NavItem[]) => {
    for (const item of items) {
      if (item.permission && item.href !== '/dashboard') map[item.href] = item.permission;
    }
  };
  add(topLevelNav);
  navGroups.forEach((g) => add(g.items));
  return { ...map, ...EXTRA_ROUTE_PERMISSIONS };
})();

/**
 * Required permission key for a given path — the most specific (longest)
 * matching prefix wins (order-independent). Null for unguarded routes.
 */
export function routePermission(pathname: string): string | null {
  let best: string | null = null;
  let bestLen = -1;
  for (const [prefix, permission] of Object.entries(ROUTE_PERMISSIONS)) {
    if (pathname.startsWith(prefix) && prefix.length > bestLen) {
      best = permission;
      bestLen = prefix.length;
    }
  }
  return best;
}

export interface Crumb {
  label: string;
  /** Present → the crumb is a link. Absent → plain text (the current page). */
  href?: string;
}

/** Turn a URL segment into a readable leaf label; ids collapse to "Detay". */
function humanizeSegment(segment: string): string {
  if (/^\d+$/.test(segment) || /^[0-9a-f]{8}-[0-9a-f]{4}/i.test(segment)) return 'Detay';
  return segment
    .split('-')
    .filter(Boolean)
    .map((word) => word[0].toLocaleUpperCase('tr-TR') + word.slice(1))
    .join(' ');
}

/**
 * The current location as a parent → child trail, derived from the nav config:
 * `[group?, page, leaf?]`. Every crumb except the current page is a link
 * (the group points at its first page). Empty when the path matches no nav item.
 */
export function breadcrumbsFor(pathname: string): Crumb[] {
  let bestItem: NavItem | undefined;
  let bestGroup: NavGroup | undefined;
  let bestLen = -1;
  const consider = (item: NavItem, group?: NavGroup) => {
    if (pathname.startsWith(item.href) && item.href.length > bestLen) {
      bestItem = item;
      bestGroup = group;
      bestLen = item.href.length;
    }
  };
  topLevelNav.forEach((item) => consider(item));
  navGroups.forEach((group) => group.items.forEach((item) => consider(item, group)));

  const item = bestItem;
  if (!item) return [];
  const group = bestGroup;

  const crumbs: Crumb[] = [];
  if (group) crumbs.push({ label: group.name, href: group.items[0]?.href });

  const isLeaf = pathname === item.href;
  crumbs.push({ label: item.name, href: isLeaf ? undefined : item.href });

  if (!isLeaf) {
    const tail = pathname.slice(item.href.length).split('/').filter(Boolean);
    const last = tail[tail.length - 1];
    if (last) crumbs.push({ label: humanizeSegment(last) });
  }

  return crumbs;
}
