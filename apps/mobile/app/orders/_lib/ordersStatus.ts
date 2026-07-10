import type { BadgeVariant } from '@tarodan/ui-native';
import { apiStatusToUi, type UiOrderStatus } from '@/utils/orderStatus';

export interface Order {
  id: string;
  orderNumber: string;
  status: UiOrderStatus;
  totalAmount: number;
  product: {
    id: string;
    title: string;
    images?: Array<{ url: string }>;
    imageUrl?: string;
  };
  seller: {
    id: string;
    displayName: string;
  };
  trackingNumber?: string;
  createdAt: string;
  isBuyer?: boolean;
  hasProductRating?: boolean;
  hasSellerRating?: boolean;
  cancellationType?: 'iptal' | 'iade' | null;
  activeRefundRequest?: { id: string; status: string } | null;
}

/** Çok ürünlü sipariş grubu (tek checkout = tek kart, ürün başına ayrı kargo) */
export interface OrderGroup {
  id: string;
  groupNumber: string;
  totalAmount: number;
  status: string; // UiOrderStatus | 'mixed'
  createdAt: string;
  orders: Order[];
}

export type OrderListEntry =
  | { kind: 'order'; order: Order }
  | { kind: 'group'; group: OrderGroup };

export type FilterType =
  | 'all' | 'pending' | 'processing' | 'shipped' | 'delivered' | 'completed' | 'refunds';

// UI status keys -> StatusBadge config (matches semantic Badge variants)
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

export const getStatusText = (status: UiOrderStatus) =>
  uiOrderStatusConfig[status]?.label ?? String(status);

// Rozet önceliği: aktif iade > iptal > normal durum.
// - activeRefundRequest dolu ama tamamlanmadıysa → "İade Sürecinde" (sipariş
//   'delivered' kalsa bile).
// - İade TAMAMLANDIYSA (status 'refunded') → "İade Edildi"; aksi halde biten iade
//   "İade Sürecinde" görünür (pickActiveRefundRequest biten talebi de döndürür).
// - cancellationType === 'iptal' → "İptal Edildi" (status 'refunded' olsa bile
//   "İade Edildi" DEME).
// - Aksi halde siparişin kendi UI durumu.
export const badgeStatusOf = (o: any): string => {
  if (o?.activeRefundRequest) {
    return o.activeRefundRequest.status === 'refunded' ? 'refunded' : 'refund_requested';
  }
  if (o?.cancellationType === 'iptal') return 'cancelled';
  return o?.status;
};

// Kargo takip satırı: SADECE gerçek gönderi varken (trackingNumber dolu + kargo
// sonrası durum). İptal (cancellationType='iptal' / status cancelled) veya iade
// edilmiş siparişte gösterilmez; teslim öncesi placeholder kargo da gözükmez.
export const showOrderTracking = (o: Order): boolean =>
  !!o.trackingNumber &&
  o.cancellationType !== 'iptal' &&
  ['shipped', 'delivered', 'awaiting_confirmation', 'completed'].includes(o.status);

export const normalizeOrder = (rawOrder: any): Order => ({
  ...rawOrder,
  status: apiStatusToUi(rawOrder.status),
  totalAmount: Number(rawOrder.totalAmount ?? rawOrder.amount ?? 0),
  product: {
    ...(rawOrder.product || {}),
    id: rawOrder.product?.id ?? '',
    title: rawOrder.product?.title ?? '',
    images: rawOrder.product?.images,
    imageUrl: rawOrder.product?.imageUrl,
  },
});

export const formatOrderDate = (dateString: string) =>
  new Date(dateString).toLocaleDateString('tr-TR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

export const formatOrderPrice = (price: number) => `₺${price.toLocaleString('tr-TR')}`;

// Yalnızca alıcı, teslim alınmış/tamamlanmış siparişi değerlendirebilir.
export const canRateOrder = (order: Order) =>
  order.isBuyer === true && ['delivered', 'completed'].includes(order.status);
