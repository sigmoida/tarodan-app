// order'dan türetilen tüm görünüm değerleri — tek saf fonksiyon.
import { COOLING_OFF_DAYS, REFUND_STATUS_LABELS } from './status';
import type { OrderDetail } from './types';

export function deriveOrderView(order: OrderDetail) {
  const isMembershipOrder = !!(order.isMembership ?? order.orderNumber?.startsWith('MEM-') ?? false);

  const canRate = !isMembershipOrder && ['delivered', 'completed'].includes(order.status);

  const isPreShipment = ['pending', 'processing'].includes(order.status);
  const isPostShipment = ['shipped', 'delivered', 'awaiting_confirmation', 'completed'].includes(
    order.status,
  );
  const isCancelled = order.status === 'cancelled' || order.cancellationType === 'iptal';
  const isDelivered = ['delivered', 'awaiting_confirmation', 'completed'].includes(order.status);

  const showTrackingCard =
    !!order.trackingNumber &&
    !!order.shippedAt &&
    isPostShipment &&
    !isCancelled &&
    order.status !== 'refunded';

  const isPaid =
    !!order.paidAt ||
    order.payment?.status === 'completed' ||
    ['processing', 'shipped', 'delivered', 'awaiting_confirmation', 'completed'].includes(order.status);

  const payoutReleaseDate = (() => {
    if (!order.deliveredAt) return null;
    const d = new Date(order.deliveredAt);
    d.setDate(d.getDate() + COOLING_OFF_DAYS);
    return d;
  })();
  const hasActiveRefund = !!order.activeRefundRequest;

  const isRefundedOrder = order.status === 'refunded' || hasActiveRefund;
  const showRefundCancelStep = isCancelled || isRefundedOrder;
  const refundCancelLabel: string = isCancelled
    ? 'İptal Edildi'
    : order.activeRefundRequest
      ? REFUND_STATUS_LABELS[order.activeRefundRequest.status]?.label ?? 'İade Sürecinde'
      : 'İade Edildi';
  const refundCancelDate: string | undefined = isCancelled
    ? order.cancelledAt ?? undefined
    : order.activeRefundRequest?.refundedAt ??
      order.activeRefundRequest?.createdAt ??
      order.cancelledAt ??
      undefined;

  const isPastRefundWindow = (() => {
    if (!order.deliveredAt) return false;
    const d = new Date(order.deliveredAt);
    if (Number.isNaN(d.getTime())) return false;
    const ageDays = (Date.now() - d.getTime()) / (1000 * 3600 * 24);
    return ageDays > COOLING_OFF_DAYS;
  })();

  return {
    isMembershipOrder,
    canRate,
    isPreShipment,
    isPostShipment,
    isCancelled,
    isDelivered,
    showTrackingCard,
    isPaid,
    payoutReleaseDate,
    hasActiveRefund,
    isRefundedOrder,
    showRefundCancelStep,
    refundCancelLabel,
    refundCancelDate,
    isPastRefundWindow,
  };
}

export type OrderView = ReturnType<typeof deriveOrderView>;
