import { ShieldCheckIcon, UserGroupIcon } from '@heroicons/react/24/outline';
import type { BadgeProps } from '@tarodan/ui';
import type { PermGroup } from './types';

// ─── Roles ───────────────────────────────────────────────────────────────────

export const ROLES = ['super_admin', 'admin', 'moderator'] as const;
export type RoleId = (typeof ROLES)[number];

export const ROLE_META: Record<RoleId, { label: string; color: string; description: string }> = {
  super_admin: {
    label: 'Süper Admin',
    color: 'bg-danger-500/10 text-danger-500 border-danger-200',
    description: 'Platforma tam erişim. Sistem ayarları, finans ve tüm yönetim işlemleri.',
  },
  admin: {
    label: 'Yönetici',
    color: 'bg-primary-500/10 text-primary-500 border-primary-200',
    description: 'Operasyonel yönetim. Sistem ayarları ve vergi hariç tüm işlemler.',
  },
  moderator: {
    label: 'Moderatör',
    color: 'bg-info-500/10 text-info-500 border-info-200',
    description: 'İçerik moderasyonu. Yalnızca ürün, yorum, mesaj ve takas takibi.',
  },
};

/** Badge variant for the role badge in the table (matches ROLE_META color). */
export const ROLE_BADGE_VARIANT: Record<RoleId, BadgeProps['variant']> = {
  super_admin: 'danger',
  admin: 'primary',
  moderator: 'info',
};

// ─── Default permissions (must stay in sync with backend DEFAULT_ROLE_PERMISSIONS) ─

export const FALLBACK_DEFAULTS: Record<RoleId, string[]> = {
  super_admin: [],
  admin: [
    'dashboard', 'analytics',
    'orders', 'trades', 'shipping', 'refund_requests', 'refund_history',
    'products', 'categories', 'brands', 'car_models', 'manufacturers', 'attributes', 'collections',
    'users', 'seller_applications', 'seller_performance', 'reviews',
    'payments', 'commission', 'payouts',
    'messages', 'support', 'discounts', 'ads', 'notifications', 'email_templates', 'pages',
    'ai_moderation',
  ],
  moderator: [
    'dashboard', 'products', 'users', 'reviews', 'messages', 'support', 'trades', 'ai_moderation',
  ],
};

// ─── Permission groups — one permission per page ─────────────────────────────

export const PERMISSION_GROUPS: PermGroup[] = [
  {
    id: 'dashboard',
    group: 'Dashboard & Analitik',
    permissions: [
      { key: 'dashboard', label: 'Dashboard', description: 'Ana panel: günlük sipariş, gelir ve aktif kullanıcı sayaçları.', pages: ['/dashboard'] },
      { key: 'analytics', label: 'Analizler', description: 'Satış grafiği, gelir analizi, kullanıcı büyümesi ve rapor sayfaları.', pages: ['/analytics'] },
    ],
  },
  {
    id: 'operations',
    group: 'Operasyon',
    permissions: [
      { key: 'orders', label: 'Siparişler', description: 'Sipariş listesi, detay görüntüleme ve durum değiştirme.', pages: ['/operations/orders', '/operations/orders/:id'] },
      { key: 'trades', label: 'Takaslar', description: 'Takas listesi, detay, onaylama, reddetme, kargo ve depo işlemleri.', pages: ['/operations/trades', '/operations/trades/:id'] },
      { key: 'shipping', label: 'Kargo', description: 'Kargo etiketi oluşturma, takip ve depoya gönderim işlemleri.', pages: ['/operations/shipping'] },
      { key: 'refund_requests', label: 'İade Talepleri', description: 'İade talep listesi, detay görüntüleme, onaylama ve reddetme.', pages: ['/operations/refund-requests', '/operations/refund-requests/:id'] },
      { key: 'refund_history', label: 'İade Geçmişi', description: 'Tamamlanmış iade kayıtları ve geçmiş liste.', pages: ['/operations/refunds'] },
    ],
  },
  {
    id: 'catalog',
    group: 'Katalog',
    permissions: [
      { key: 'products', label: 'Ürünler', description: 'Ürün listesi, detay, onaylama, reddetme ve düzenleme.', pages: ['/catalog/products', '/catalog/products/:id'] },
      { key: 'categories', label: 'Kategoriler', description: 'Kategori ağacı oluşturma, düzenleme ve silme.', pages: ['/catalog/categories'] },
      { key: 'brands', label: 'Markalar', description: 'Marka listesi, ekleme ve düzenleme.', pages: ['/catalog/brands'] },
      { key: 'car_models', label: 'Araç Modelleri', description: 'Araç modeli ve yıl listesi yönetimi.', pages: ['/catalog/car-models'] },
      { key: 'manufacturers', label: 'Üreticiler', description: 'Üretici/tedarikçi ekleme ve düzenleme.', pages: ['/catalog/manufacturers'] },
      { key: 'attributes', label: 'Ürün Özellikleri', description: 'Özellik grubu ve değer yönetimi.', pages: ['/catalog/attributes'] },
      { key: 'collections', label: 'Koleksiyonlar', description: 'Ürün koleksiyonu oluşturma ve düzenleme.', pages: ['/catalog/collections'] },
    ],
  },
  {
    id: 'accounts',
    group: 'Hesaplar',
    permissions: [
      { key: 'users', label: 'Kullanıcılar', description: 'Kullanıcı listesi, profil, ban/ban kaldırma ve kimlik doğrulama.', pages: ['/accounts/users', '/accounts/users/:id'] },
      { key: 'seller_applications', label: 'Satıcı Başvuruları', description: 'Satıcı başvurularını onaylama veya reddetme.', pages: ['/accounts/seller-applications'] },
      { key: 'seller_performance', label: 'Satıcı Performansı', description: 'Satıcı performans raporları ve istatistikleri.', pages: ['/accounts/seller-performance'] },
      { key: 'reviews', label: 'Yorumlar', description: 'Kullanıcı yorumlarını görüntüleme, onaylama ve reddetme.', pages: ['/accounts/reviews'] },
      { key: 'staff', label: 'Rol Yönetimi', description: 'Yönetici hesabı oluşturma, rol atama ve izin matrisi düzenleme.', pages: ['/accounts/roles'] },
    ],
  },
  {
    id: 'messaging',
    group: 'Mesajlaşma',
    permissions: [
      { key: 'messages', label: 'Mesajlar', description: 'Kullanıcılar arası mesaj konuşmalarını görüntüleme ve moderasyon.', pages: ['/messaging/messages', '/messaging/messages/:threadId'] },
      { key: 'support', label: 'Destek Talepleri', description: 'Kullanıcı destek taleplerini görüntüleme ve yanıtlama.', pages: ['/messaging/support', '/messaging/support/:id'] },
    ],
  },
  {
    id: 'marketing',
    group: 'Pazarlama & İçerik',
    permissions: [
      { key: 'discounts', label: 'İndirimler', description: 'İndirim kuponu oluşturma, düzenleme ve silme.', pages: ['/marketing/discounts'] },
      { key: 'ads', label: 'Reklamlar', description: 'Banner ve reklam kampanyaları yönetimi.', pages: ['/marketing/ads'] },
      { key: 'notifications', label: 'Bildirimler', description: 'Push bildirim oluşturma ve gönderme.', pages: ['/marketing/notifications'] },
      { key: 'email_templates', label: 'E-posta Şablonları', description: 'E-posta şablonu oluşturma ve düzenleme.', pages: ['/marketing/email-templates'] },
      { key: 'pages', label: 'Sayfalar', description: 'Statik içerik sayfaları yönetimi.', pages: ['/marketing/pages'] },
    ],
  },
  {
    id: 'finance',
    group: 'Finans',
    permissions: [
      { key: 'payments', label: 'Ödemeler', description: 'Ödeme listesi, hold/release geçmişi ve istatistikler.', pages: ['/finance/payments', '/finance/payments/:id', '/finance/payments/statistics'] },
      { key: 'commission', label: 'Komisyon', description: 'Komisyon kuralları oluşturma, düzenleme ve silme.', pages: ['/finance/commission'] },
      { key: 'payouts', label: 'Satıcı Ödemeleri', description: 'Bekleyen ödeme transferleri ve payout geçmişi.', pages: ['/finance/payouts'] },
      { key: 'tax', label: 'Vergi Ayarları', description: 'KDV bölgeleri, vergi oranları ve kural yönetimi.', pages: ['/finance/tax'] },
    ],
  },
  {
    id: 'system',
    group: 'Sistem',
    permissions: [
      { key: 'ai_moderation', label: 'AI Denetim', description: 'AI moderasyon olayları, skorlar ve eşik ayarları.', pages: ['/system/ai-moderation'] },
      { key: 'membership_tiers', label: 'Üyelik Katmanları', description: 'Üyelik katmanı oluşturma ve fiyatlandırma.', pages: ['/system/membership-tiers'] },
      { key: 'settings', label: 'Sistem Ayarları', description: 'Platform genel ayarları ve konfigürasyon.', pages: ['/system/settings'] },
      { key: 'logs', label: 'Loglar', description: 'Sistem hata logları, güvenlik olayları, e-posta logları ve denetim izi.', pages: ['/system/logs'] },
    ],
  },
];

/** Two tabs: permission matrix + user assignments. */
export const ROLE_TABS = [
  { key: 'matrix', label: 'İzin Matrisi', icon: ShieldCheckIcon },
  { key: 'users', label: 'Kullanıcı Atamaları', icon: UserGroupIcon },
];
