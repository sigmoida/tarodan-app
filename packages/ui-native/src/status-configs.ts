import type { BadgeVariant } from './Badge';

export interface StatusConfig {
  label: string;
  variant: BadgeVariant;
}

export const orderStatusConfig: Record<string, StatusConfig> = {
  pending_payment: { label: 'Ödeme Bekleniyor', variant: 'warning' },
  paid: { label: 'Ödendi', variant: 'success' },
  preparing: { label: 'Hazırlanıyor', variant: 'info' },
  shipped: { label: 'Kargoda', variant: 'info' },
  delivered: { label: 'Teslim Edildi', variant: 'success' },
  completed: { label: 'Tamamlandı', variant: 'success' },
  cancelled: { label: 'İptal Edildi', variant: 'danger' },
  refunded: { label: 'İade Edildi', variant: 'secondary' },
};

export const tradeStatusConfig: Record<string, StatusConfig> = {
  pending: { label: 'Bekliyor', variant: 'warning' },
  accepted: { label: 'Kabul Edildi', variant: 'success' },
  rejected: { label: 'Reddedildi', variant: 'danger' },
  awaiting_payment: { label: 'Ödeme Bekleniyor', variant: 'warning' },
  shipping_to_warehouse: { label: 'Depoya Gönderim', variant: 'info' },
  at_warehouse: { label: 'Tarodan Deposunda', variant: 'info' },
  admin_reviewing: { label: 'İnceleniyor', variant: 'info' },
  shipping_to_recipients: { label: 'Alıcılara Gönderim', variant: 'info' },
  returning: { label: 'İade Yolda', variant: 'warning' },
  initiator_shipped: { label: 'Gönderildi', variant: 'info' },
  receiver_shipped: { label: 'Karşı Taraf Gönderdi', variant: 'info' },
  both_shipped: { label: 'İki Taraf Gönderdi', variant: 'info' },
  initiator_received: { label: 'Teslim Alındı', variant: 'info' },
  receiver_received: { label: 'Karşı Taraf Teslim Aldı', variant: 'info' },
  completed: { label: 'Tamamlandı', variant: 'success' },
  cancelled: { label: 'İptal Edildi', variant: 'danger' },
  disputed: { label: 'İtiraz Açıldı', variant: 'danger' },
};

export const offerStatusConfig: Record<string, StatusConfig> = {
  pending: { label: 'Bekliyor', variant: 'warning' },
  accepted: { label: 'Kabul Edildi', variant: 'success' },
  rejected: { label: 'Reddedildi', variant: 'danger' },
  countered: { label: 'Karşı Teklif', variant: 'info' },
  expired: { label: 'Süresi Doldu', variant: 'secondary' },
  cancelled: { label: 'İptal Edildi', variant: 'danger' },
  payment_expired: { label: 'Ödeme Süresi Doldu', variant: 'warning' },
};

export const paymentStatusConfig: Record<string, StatusConfig> = {
  pending: { label: 'Bekliyor', variant: 'warning' },
  processing: { label: 'İşleniyor', variant: 'info' },
  completed: { label: 'Tamamlandı', variant: 'success' },
  failed: { label: 'Başarısız', variant: 'danger' },
  refunded: { label: 'İade Edildi', variant: 'secondary' },
  cancelled: { label: 'İptal Edildi', variant: 'danger' },
};

export const productStatusConfig: Record<string, StatusConfig> = {
  pending: { label: 'Onay Bekliyor', variant: 'warning' },
  active: { label: 'Aktif', variant: 'success' },
  inactive: { label: 'Pasif', variant: 'secondary' },
  sold: { label: 'Satıldı', variant: 'info' },
  reserved: { label: 'Rezerve', variant: 'info' },
  rejected: { label: 'Reddedildi', variant: 'danger' },
  deleted: { label: 'Kaldırıldı', variant: 'danger' },
};
