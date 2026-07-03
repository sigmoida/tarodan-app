import type { OrderDetail } from '../types';

const statusConfig: Record<string, { label: string; color: string; bg: string }> = {
  pending_payment: { label: 'Ödeme Bekliyor', color: 'text-warning-600', bg: 'bg-warning-100' },
  paid: { label: 'Ödendi', color: 'text-info-600', bg: 'bg-info-100' },
  preparing: { label: 'Hazırlanıyor', color: 'text-primary-600', bg: 'bg-primary-100' },
  shipped: { label: 'Kargoda', color: 'text-info-600', bg: 'bg-info-100' },
  delivered: { label: 'Teslim Edildi', color: 'text-success-600', bg: 'bg-success-100' },
  awaiting_buyer_confirmation: { label: 'İade Penceresinde (14 gün)', color: 'text-warning-600', bg: 'bg-warning-100' },
  refund_requested: { label: 'İade Talebi Açık', color: 'text-danger-600', bg: 'bg-danger-100' },
  completed: { label: 'Tamamlandı', color: 'text-success-600', bg: 'bg-success-100' },
  cancelled: { label: 'İptal', color: 'text-danger-600', bg: 'bg-danger-100' },
  refunded: { label: 'İade Edildi', color: 'text-muted', bg: 'bg-surface-alt' },
};

export interface OrderStatusView {
  label: string;
  color: string;
  bg: string;
  hasActiveRefund: boolean;
  isCancelledOrder: boolean;
}

/**
 * The order's headline status — priority: active refund > cancellation > raw
 * status. Mirrors the list badge logic.
 */
export function getOrderStatusInfo(order: OrderDetail): OrderStatusView {
  const hasActiveRefund = !!order.activeRefundRequest || order.status === 'refund_requested';
  const isCancelledOrder = order.cancellationType === 'iptal' || order.status === 'cancelled';
  const info = hasActiveRefund
    ? { label: 'İade Sürecinde', color: 'text-danger-600', bg: 'bg-danger-100' }
    : order.cancellationType === 'iptal'
      ? { label: 'İptal Edildi', color: 'text-danger-600', bg: 'bg-danger-100' }
      : statusConfig[order.status] || statusConfig.pending_payment;
  return { ...info, hasActiveRefund, isCancelledOrder };
}

const POST_SHIPPING = [
  'shipped',
  'delivered',
  'awaiting_buyer_confirmation',
  'completed',
  'refund_requested',
  'refunded',
];

/** Kargo sonrası: iptal kapalı, iade akışı geçerli. */
export function isPostShipping(status: string): boolean {
  return POST_SHIPPING.includes(status);
}

const SHIPPED_STATUSES = ['shipped', 'delivered', 'awaiting_buyer_confirmation', 'completed'];

/** Gerçek gönderi var mı: trackingNumber dolu + kargolanmış aşama + iptal değil. */
export function hasRealShipment(order: OrderDetail, isCancelledOrder: boolean): boolean {
  return (
    !!order.shipment &&
    !!order.shipment.trackingNumber &&
    SHIPPED_STATUSES.includes(order.status) &&
    !isCancelledOrder
  );
}
