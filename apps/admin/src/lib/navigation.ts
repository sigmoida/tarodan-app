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
    items: [
      { name: 'Siparişler', href: '/orders', icon: ClipboardDocumentListIcon, keywords: ['order'], permission: 'orders' },
      { name: 'Takaslar', href: '/trades', icon: ArrowsRightLeftIcon, keywords: ['takas', 'trade', 'barter', 'değişim'], permission: 'trades' },
      { name: 'Kargo', href: '/shipping', icon: TruckIcon, keywords: ['kargo', 'shipping', 'gönderi', 'etiket', 'takip'], permission: 'shipping' },
      { name: 'İade Takibi', href: '/refund-requests', icon: BanknotesIcon, keywords: ['iade', 'refund', 'talep', 'takip'], permission: 'refund_requests' },
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
