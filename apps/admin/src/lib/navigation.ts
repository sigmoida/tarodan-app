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
} from '@heroicons/react/24/outline';

/**
 * Admin sol menüsünün TEK kaynağı. Nav verisi burada (veri ≠ component); kabuk
 * component'leri bunu tüketir. Route→izin eşlemesi de buradan türetilir
 * (`routePermission`) — ayrı bir liste tutulmaz.
 */

export type NavItem = {
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
      { name: 'Rol Yönetimi', href: '/roles', icon: UserCircleIcon, permission: 'staff' },
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
      // KUPON/İndirimler sekmesi devre dışı (yoruma alındı) — sayfa kodu ve route duruyor
      // { name: 'İndirimler', href: '/discounts', icon: TicketIcon, permission: 'discounts' },
      { name: 'Reklamlar', href: '/marketing/ads', icon: MegaphoneIcon, keywords: ['reklam', 'ad', 'banner'], permission: 'ads' },
      { name: 'Bildirimler', href: '/marketing/notifications', icon: BellAlertIcon, permission: 'notifications' },
      { name: 'E-posta Şablonları', href: '/marketing/email-templates', icon: ChatBubbleLeftRightIcon, permission: 'email_templates' },
      { name: 'Sayfalar', href: '/marketing/pages', icon: DocumentTextIcon, permission: 'pages' },
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
      { name: 'Faturalar', href: '/invoices', icon: DocumentTextIcon, keywords: ['fatura', 'invoice', 'e-arşiv', 'e-fatura', 'elogo', 'iade faturası'], permission: 'invoices' },
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

/** Bir nav öğesinin arama sorgusuyla eşleşip eşleşmediği (ad/href/keywords). */
export function matchesQuery(item: NavItem, q: string): boolean {
  const name = item.name.toLocaleLowerCase('tr-TR');
  const href = item.href.toLowerCase();
  if (name.includes(q) || href.includes(q)) return true;
  return (item.keywords ?? []).some((k) => k.toLocaleLowerCase('tr-TR').includes(q));
}

/**
 * Nav'da görünmeyen ama yine de korunması gereken route'lar (alias'lar / devre
 * dışı sekmeler). Nav öğelerinden türetilemeyen istisnalar burada.
 */
const EXTRA_ROUTE_PERMISSIONS: Record<string, string> = {
  '/discounts': 'discounts', // nav'da yoruma alınmış ama route + guard duruyor
  '/moderation': 'ai_moderation', // /ai-moderation alias'ı
  '/audit-logs': 'audit_logs', // ayrı denetim log route'u
};

/**
 * Route→izin haritası. Nav öğelerinin `permission` alanından türetilir + yukarıdaki
 * istisnalar. Dashboard bilinçli olarak DIŞARIDA: her zaman erişilebilir (guard'ın
 * redirect hedefi de burası — döngü olmasın).
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
 * Verilen path için gerekli izin anahtarı — en spesifik (en uzun) eşleşen prefix
 * kazanır (sıralamadan bağımsız). Korunmayan route için null.
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
