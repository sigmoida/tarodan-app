import { theme } from '@tarodan/ui-native';

const { colors } = theme;

export interface OrderStatus {
  id: string;
  orderNumber: string;
  status: string;
  totalAmount: number;
  createdAt: string;
  product: {
    title: string;
    images: string[];
  };
  shipment?: {
    trackingNumber: string;
    provider: string;
    status: string;
    estimatedDelivery?: string;
  };
}

export const STATUS_MAP: Record<string, { label: string; color: string; icon: string }> = {
  pending_payment: { label: 'Ödeme Bekleniyor', color: colors.warning[500]!, icon: 'time-outline' },
  paid: { label: 'Ödeme Alındı', color: colors.success[600]!, icon: 'checkmark-circle-outline' },
  preparing: { label: 'Hazırlanıyor', color: colors.info[600]!, icon: 'construct-outline' },
  shipped: { label: 'Kargoya Verildi', color: colors.info[700]!, icon: 'car-outline' },
  delivered: { label: 'Teslim Edildi', color: colors.success[600]!, icon: 'checkmark-done-outline' },
  completed: { label: 'Tamamlandı', color: colors.success[600]!, icon: 'trophy-outline' },
  cancelled: { label: 'İptal Edildi', color: colors.danger[600]!, icon: 'close-circle-outline' },
  refunded: { label: 'İade Edildi', color: colors.warning[600]!, icon: 'return-down-back-outline' },
  refund_requested: { label: 'İade Sürecinde', color: colors.danger[600]!, icon: 'return-down-back-outline' },
};

// Terminal/kapalı durumlar: mutlu-yol (Oluşturuldu→Ödeme→Kargo→Teslim) zaman
// çizelgesi yanıltıcı olur; bunun yerine net bir son-durum bloğu gösterilir.
export const CLOSED_TRACK_STATUSES = ['cancelled', 'refunded', 'refund_requested'];
export const CLOSED_TRACK_HINTS: Record<string, string> = {
  cancelled: 'Siparişiniz iptal edildi. Ödemeniz varsa hesabınıza iade edilir.',
  refunded: 'Siparişinizin iadesi tamamlandı; ödemeniz iade edildi.',
  refund_requested: 'İade talebiniz işleniyor. Süreç tamamlandığında bilgilendirileceksiniz.',
};

export const getStatusInfo = (status: string) =>
  STATUS_MAP[status] || { label: status, color: colors.gray[500]!, icon: 'help-circle-outline' };

export const formatTrackDate = (dateString: string) => {
  const date = new Date(dateString);
  return date.toLocaleDateString('tr-TR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

export function getStatusSteps(status: string): number {
  const steps: Record<string, number> = {
    pending_payment: 0,
    paid: 1,
    preparing: 2,
    shipped: 3,
    delivered: 4,
    completed: 4,
  };
  return steps[status] ?? 0;
}
