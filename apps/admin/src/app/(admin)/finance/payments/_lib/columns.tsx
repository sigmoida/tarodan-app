import { Badge } from '@tarodan/ui';
import { col, type RowActionItem } from '@/components/table';
import { type Payment, paymentStatusConfig } from './types';

export function paymentColumns(rowMenu: (p: Payment) => RowActionItem[]) {
  return [
    col.link<Payment>(
      'Sipariş No',
      (p) => ({ href: `/operations/orders/${p.orderId}`, label: `#${p.orderNumber}` }),
      { grow: 1, minWidth: 120 },
    ),
    col.custom<Payment>(
      'Alıcı / Satıcı',
      (p) => (
        <div className="text-sm">
          <p className="font-medium text-heading">Alıcı: {p.buyer.displayName}</p>
          <p className="text-xs text-muted">{p.buyer.email}</p>
          <p className="mt-1 font-medium text-heading">Satıcı: {p.seller.displayName}</p>
          <p className="text-xs text-muted">{p.seller.email}</p>
        </div>
      ),
      { grow: 3, minWidth: 200 },
    ),
    col.money<Payment>('Tutar', (p) => p.amount),
    col.muted<Payment>('Sağlayıcı', (p) => p.provider?.toUpperCase()),
    col.custom<Payment>('Durum', (p) => (
      <div>
        <Badge status={p.status} config={paymentStatusConfig} />
        {p.failureReason && <p className="mt-1 text-xs text-danger-600">{p.failureReason}</p>}
      </div>
    )),
    col.date<Payment>('Tarih', (p) => p.createdAt),
    col.rowMenu<Payment>(rowMenu),
  ];
}
