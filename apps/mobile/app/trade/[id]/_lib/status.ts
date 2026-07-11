// Takas statü haritaları + geri sayım/kargo yardımcıları — TEK kaynak.
import { theme } from '@tarodan/ui-native';
import type { Trade, TFn } from './types';

const { colors } = theme;

// Status meta (icon + color) — üst statü banner'ı için. Yeni auto-shipping akışı
// için yerelleştirilmiş etiketler NEW_STATUS_KEYS ile uygulanır.
export const TRADE_STATUSES = {
  pending: { label: 'Bekliyor', color: colors.warning[600]!, icon: 'time-outline' },
  accepted: { label: 'Kabul Edildi', color: colors.success[600]!, icon: 'checkmark-circle-outline' },
  rejected: { label: 'Reddedildi', color: colors.danger[600]!, icon: 'close-circle-outline' },
  countered: { label: 'Karşı Teklif', color: colors.info[600]!, icon: 'swap-horizontal' },
  awaiting_payment: { label: 'Ödeme Bekleniyor', color: colors.warning[600]!, icon: 'card-outline' },
  shipping_to_warehouse: { label: 'Depoya Gönderim', color: colors.info[600]!, icon: 'cube-outline' },
  at_warehouse: { label: 'Depoda', color: colors.info[600]!, icon: 'business-outline' },
  admin_reviewing: { label: 'İnceleniyor', color: colors.info[600]!, icon: 'search-outline' },
  shipping_to_recipients: { label: 'Alıcılara Gönderim', color: colors.primary[600]!, icon: 'airplane-outline' },
  returning: { label: 'İade Sürecinde', color: colors.warning[600]!, icon: 'return-up-back-outline' },
  // Legacy fallbacks
  initiator_shipped: { label: 'Kargo Yolda', color: colors.info[600]!, icon: 'cube-outline' },
  receiver_shipped: { label: 'Kargo Yolda', color: colors.info[600]!, icon: 'cube-outline' },
  both_shipped: { label: 'Kargo Yolda', color: colors.primary[600]!, icon: 'airplane-outline' },
  completed: { label: 'Tamamlandı', color: colors.success[600]!, icon: 'checkmark-done-circle-outline' },
  cancelled: { label: 'İptal Edildi', color: colors.text.muted, icon: 'ban-outline' },
  disputed: { label: 'İtiraz Var', color: colors.danger[600]!, icon: 'warning-outline' },
};

// Statü açıklamaları — banner altındaki bilgilendirme kartı (web parity).
export const STATUS_DESCRIPTIONS: Record<string, string> = {
  pending: 'Karşı tarafın teklifi yanıtlaması bekleniyor.',
  accepted: 'Takas kabul edildi. Şimdi ürünler Tarodan deposuna kargolanacak.',
  awaiting_payment: 'Nakit fark ödemesi bekleniyor. Ödeme tamamlanınca kargo süreci başlar.',
  shipping_to_warehouse: 'Her iki taraf da ürününü Tarodan deposuna kargoluyor.',
  at_warehouse: 'Ürünler Tarodan deposuna ulaştı.',
  admin_reviewing: 'Ekibimiz ürünleri inceliyor. Onay sonrası size kargolanacak.',
  shipping_to_recipients: 'Ürünler depodan size doğru kargolanıyor.',
  returning: 'Takas reddedildi. Ürünleriniz size iade ediliyor.',
  completed: 'Takas başarıyla tamamlandı.',
  rejected: 'Bu takas teklifi reddedildi.',
  cancelled: 'Bu takas iptal edildi.',
  disputed: 'Bu takas için bir itiraz açıldı. Ekibimiz inceliyor.',
};

// Yeni auto-shipping akışı statülerinin i18n etiket anahtarları.
export const NEW_STATUS_KEYS: Record<string, string> = {
  awaiting_payment: 'trade.tradeStatus.awaiting_payment',
  shipping_to_warehouse: 'trade.tradeStatus.shipping_to_warehouse',
  at_warehouse: 'trade.tradeStatus.at_warehouse',
  admin_reviewing: 'trade.tradeStatus.admin_reviewing',
  shipping_to_recipients: 'trade.tradeStatus.shipping_to_recipients',
};

// Depo-escrow akışı için yatay ilerleme çubuğu statüleri.
export const STEP_FLOW_STATUSES = new Set([
  'accepted',
  'awaiting_payment',
  'shipping_to_warehouse',
  'at_warehouse',
  'admin_reviewing',
  'shipping_to_recipients',
  'completed',
]);

// Statü → görünür adım. admin_reviewing, "Depoda" adımına denk gelir.
export const STATUS_TO_STEP_KEY: Record<string, string> = {
  accepted: 'accepted',
  awaiting_payment: 'awaiting_payment',
  shipping_to_warehouse: 'shipping_to_warehouse',
  at_warehouse: 'at_warehouse',
  admin_reviewing: 'at_warehouse',
  shipping_to_recipients: 'shipping_to_recipients',
  completed: 'completed',
};

export const SHIPMENT_STATUS_CHIP: Record<
  string,
  { labelKey: string; bg: string; fg: string; icon?: string }
> = {
  label_created: { labelKey: 'trade.shipmentStatus.label_created', bg: colors.surface.alt, fg: colors.text.muted },
  pending: { labelKey: 'trade.shipmentStatus.pending', bg: colors.surface.alt, fg: colors.text.muted },
  picked_up: { labelKey: 'trade.shipmentStatus.picked_up', bg: colors.info[50]!, fg: colors.info[600]! },
  in_transit: { labelKey: 'trade.shipmentStatus.in_transit', bg: colors.info[50]!, fg: colors.info[600]! },
  at_delivery_branch: { labelKey: 'trade.shipmentStatus.at_delivery_branch', bg: colors.info[50]!, fg: colors.info[600]! },
  out_for_delivery: { labelKey: 'trade.shipmentStatus.out_for_delivery', bg: colors.info[50]!, fg: colors.info[600]! },
  delivered: { labelKey: 'trade.shipmentStatus.delivered', bg: colors.success[50]!, fg: colors.success[600]!, icon: '✓' },
  failed: { labelKey: 'trade.shipmentStatus.failed', bg: colors.warning[50]!, fg: colors.warning[600]! },
  cancelled: { labelKey: 'trade.shipmentStatus.cancelled', bg: colors.warning[50]!, fg: colors.warning[600]! },
  returned: { labelKey: 'trade.shipmentStatus.returned', bg: colors.warning[50]!, fg: colors.warning[600]! },
  return_in_progress: { labelKey: 'trade.shipmentStatus.return_in_progress', bg: colors.warning[50]!, fg: colors.warning[600]! },
};

// Statüye göre aktif son tarih alanı.
export function deadlineForStatus(trade: Trade): string | null {
  if (trade.status === 'pending') return trade.responseDeadline ?? null;
  if (trade.status === 'awaiting_payment') return trade.paymentDeadline ?? null;
  if (trade.status === 'shipping_to_warehouse') return trade.shippingDeadline ?? null;
  if (trade.status === 'shipping_to_recipients') return trade.confirmationDeadline ?? null;
  return null;
}

// Kalan süreyi "2g 04:15:30" / "04:15:30" biçiminde döndürür; süre dolduysa null.
export function formatCountdown(deadlineIso: string | null | undefined, nowMs: number): string | null {
  if (!deadlineIso) return null;
  const end = new Date(deadlineIso).getTime();
  if (isNaN(end)) return null;
  const diff = end - nowMs;
  if (diff <= 0) return null;
  const totalSec = Math.floor(diff / 1000);
  const days = Math.floor(totalSec / 86400);
  const hours = Math.floor((totalSec % 86400) / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const secs = totalSec % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  const hms = `${pad(hours)}:${pad(mins)}:${pad(secs)}`;
  return days > 0 ? `${days}g ${hms}` : hms;
}

// Karşı tarafın depoya-kargo durumuna göre ipucu metni.
export function renderOtherShipmentHint(s: string | null | undefined, t: TFn): string {
  if (s === 'delivered') return t('trade.warehouseShipping.counterpartyDelivered');
  if (s === 'picked_up' || s === 'in_transit' || s === 'at_delivery_branch' || s === 'out_for_delivery')
    return t('trade.warehouseShipping.counterpartyInTransit');
  if (s === 'cancelled') return t('trade.warehouseShipping.counterpartyCancelled');
  if (s === 'failed') return t('trade.warehouseShipping.counterpartyFailed');
  if (s === 'returned' || s === 'return_in_progress') return t('trade.warehouseShipping.counterpartyReturned');
  return t('trade.warehouseShipping.counterpartyWaiting');
}
