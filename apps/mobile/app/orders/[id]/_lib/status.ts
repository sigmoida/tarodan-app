// Sipariş/iade statü haritaları + sabitler — TEK kaynak.
import type { BadgeVariant } from '@tarodan/ui-native';

export const MAX_EVIDENCE_PHOTOS = 5;
// Saticiya ödeme = teslim + 14 gün cayma penceresi.
export const COOLING_OFF_DAYS = 14;

// 14 gün koşulsuz iade (Mesafeli Satış cayma hakkı): sebep/foto opsiyonel.
export const REFUND_REASONS: Array<{ value: string; label: string }> = [
  { value: 'changed_mind', label: 'Fikrim değişti / vazgeçtim' },
  { value: 'damaged', label: 'Hasarlı geldi' },
  { value: 'not_as_described', label: 'Açıklamayla uyuşmuyor' },
  { value: 'wrong_item', label: 'Yanlış ürün geldi' },
  { value: 'missing_parts', label: 'Eksik parça var' },
  { value: 'other', label: 'Diğer' },
];

export const REFUND_STATUS_LABELS: Record<string, { label: string; variant: BadgeVariant }> = {
  pending_review: { label: 'Talep İnceleniyor', variant: 'info' },
  approved: { label: 'Onaylandı, İşleniyor', variant: 'info' },
  wait_for_delivery: { label: 'Ürün Tesliminden Sonra İade Açılacak', variant: 'info' },
  return_shipment_open: { label: 'İade Kargonuz Hazır', variant: 'info' },
  return_in_transit: { label: 'İade Yolda', variant: 'info' },
  return_delivered: { label: 'Satıcıya Ulaştı, Para İadesi Yapılıyor', variant: 'info' },
  refunded: { label: 'İade Tamamlandı', variant: 'success' },
  rejected: { label: 'Talep Reddedildi', variant: 'danger' },
  disputed: { label: 'İtirazlı (İnceleniyor)', variant: 'warning' },
  cancelled: { label: 'İptal Edildi', variant: 'secondary' },
};

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
};

// Rozet önceliği: aktif iade > iptal > normal durum.
export const badgeStatusOf = (o: any): string => {
  if (o?.activeRefundRequest) {
    return o.activeRefundRequest.status === 'refunded' ? 'refunded' : 'refund_requested';
  }
  if (o?.cancellationType === 'iptal') return 'cancelled';
  return o?.status;
};
