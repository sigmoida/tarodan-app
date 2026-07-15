import type { BadgeVariant } from '@tarodan/ui-native';
import type { Sale, FilterType } from './types';

// TÜM OrderStatus enum değerlerini kapsar (eksik durum = StatusBadge ham enum
// gösterir, örn. "refunded"). Etiketler alıcı orders/[id] uiOrderStatusConfig ile
// tutarlı; yalnız 'paid' satıcıya aksiyon-odaklı. preparing→processing normalize
// edildiğinden ikisi de var.
export const salesStatusConfig: Record<string, { label: string; variant: BadgeVariant }> = {
  pending_payment: { label: 'Ödeme Bekliyor', variant: 'warning' },
  paid: { label: 'Ödendi - Hazırla', variant: 'success' },
  preparing: { label: 'Hazırlanıyor', variant: 'info' },
  processing: { label: 'Hazırlanıyor', variant: 'info' },
  shipped: { label: 'Kargoda', variant: 'primary' },
  delivered: { label: 'Teslim Edildi', variant: 'success' },
  awaiting_buyer_confirmation: { label: 'Onay Bekleniyor', variant: 'info' },
  completed: { label: 'Tamamlandı', variant: 'success' },
  cancelled: { label: 'İptal Edildi', variant: 'danger' },
  refund_requested: { label: 'İade Sürecinde', variant: 'danger' },
  refunded: { label: 'İade Edildi', variant: 'secondary' },
};

// Filtre sekmeleri sırası.
export const SALE_FILTERS: FilterType[] = [
  'all',
  'paid',
  'processing',
  'shipped',
  'completed',
  'cancelled',
];

// Rozet/filtre durumu: cancellationType='iptal' → 'cancelled' (status 'refunded'
// olsa bile "İade" deme); aksi halde siparişin kendi durumu. Alıcı orders/index
// badgeStatusOf ile tutarlı.
export const saleBadgeStatus = (sale: Sale): string =>
  sale.cancellationType === 'iptal' ? 'cancelled' : sale.status;

export const getStatusLabel = (status: FilterType): string => {
  if (status === 'all') return 'Tümü';
  if (status === 'cancelled') return 'İptal / İade';
  return salesStatusConfig[status]?.label ?? status;
};

export const formatDate = (dateString: string): string =>
  new Date(dateString).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' });

export const formatPrice = (price: number): string => `₺${price.toLocaleString('tr-TR')}`;
