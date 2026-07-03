import Link from 'next/link';
import { cancelReasonLabel, orderOriginLabel } from '@/lib/utils';
import type { OrderDetail } from '../types';
import type { OrderStatusView } from '../_lib/status';

/** The active-refund / cancellation notice banners above the detail grid. */
export function OrderBanners({
  order,
  status,
}: {
  order: OrderDetail;
  status: OrderStatusView;
}) {
  return (
    <>
      {status.hasActiveRefund && !status.isCancelledOrder && (
        <div className="rounded-lg border border-danger-200 bg-danger-50 px-4 py-3">
          <p className="text-sm font-medium text-danger-700">
            Açık iade talebi — sipariş iade sürecinde
            {order.activeRefundRequest?.refundNumber
              ? ` (${order.activeRefundRequest.refundNumber})`
              : ''}
          </p>
          <p className="mt-0.5 text-xs text-danger-600">
            Satıcıya ödeme (payout) iade sonuçlanana kadar bekletilir. Aksiyon için{' '}
            <Link href="/operations/refunds" className="underline hover:text-danger-700">
              İade Talepleri
            </Link>{' '}
            sayfasını kullanın.
          </p>
        </div>
      )}

      {status.isCancelledOrder && (cancelReasonLabel(order.cancelReason) || order.offerId) && (
        <div className="rounded-lg border border-danger-200 bg-danger-50 px-4 py-3">
          <p className="text-sm font-medium text-danger-700">
            İptal nedeni: {cancelReasonLabel(order.cancelReason) ?? 'Belirtilmemiş'}
          </p>
          <p className="mt-0.5 text-xs text-danger-600">
            Köken: {orderOriginLabel(order.offerId)}
            {order.cancelReason ? ` · "${order.cancelReason}"` : ''}
          </p>
        </div>
      )}
    </>
  );
}
