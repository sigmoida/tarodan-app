import type { BadgeVariant } from '@tarodan/ui-native';
import type { GroupOrder } from './types';

export const uiOrderStatusConfig: Record<string, { label: string; variant: BadgeVariant }> = {
  pending: { label: 'Ödeme bekliyor', variant: 'warning' },
  paid: { label: 'Ödendi', variant: 'info' },
  processing: { label: 'Hazırlanıyor', variant: 'info' },
  shipped: { label: 'Kargoda', variant: 'primary' },
  delivered: { label: 'Teslim Edildi', variant: 'success' },
  awaiting_confirmation: { label: 'Onayınız Bekleniyor', variant: 'warning' },
  completed: { label: 'Tamamlandı', variant: 'success' },
  cancelled: { label: 'İptal Edildi', variant: 'danger' },
  refunded: { label: 'İade Edildi', variant: 'secondary' },
  refund_requested: { label: 'İade Sürecinde', variant: 'danger' },
  mixed: { label: 'Karışık Durum', variant: 'info' },
};

// Rozet önceliği (liste/detay ile aynı): aktif iade > iptal > normal durum.
// İade tamamlandıysa (status 'refunded') "İade Edildi", aksi halde "İade Sürecinde".
export const badgeStatusOf = (o: {
  status: string;
  cancellationType?: 'iptal' | 'iade' | null;
  activeRefundRequest?: { id: string; status: string } | null;
}): string => {
  if (o.activeRefundRequest) {
    return o.activeRefundRequest.status === 'refunded' ? 'refunded' : 'refund_requested';
  }
  if (o.cancellationType === 'iptal') return 'cancelled';
  return o.status;
};

export const formatDate = (dateString: string) =>
  new Date(dateString).toLocaleDateString('tr-TR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

/** Bir ürün satırının türetilmiş görünüm bayrakları (kargo/iptal/iade gösterimi). */
export function deriveOrderRow(order: GroupOrder) {
  const tracking = order.trackingNumber || order.shipment?.trackingNumber;
  // Kargo öncesi = İptal, kargo sonrası = İade. apiStatusToUi paid/preparing'i
  // 'processing'e indirir; 'pending' ödeme bekleyen sipariştir.
  const isPreShipment = ['pending', 'processing'].includes(order.status);
  const isCancelled = order.status === 'cancelled' || order.cancellationType === 'iptal';
  const isClosed = isCancelled || order.status === 'refunded';
  const isDelivered = ['delivered', 'awaiting_confirmation', 'completed'].includes(order.status);
  const showTracking =
    !!tracking &&
    !isCancelled &&
    order.status !== 'refunded' &&
    ['shipped', 'delivered', 'awaiting_confirmation', 'completed'].includes(order.status);
  const actionLabel = isClosed ? null : isPreShipment ? 'İptal işlemleri' : 'İade işlemleri';
  return { tracking, isPreShipment, isCancelled, isClosed, isDelivered, showTracking, actionLabel };
}
