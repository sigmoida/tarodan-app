import Link from 'next/link';
import { StatusBadge } from '@tarodan/ui';
import { col } from '@/components/table';
import { type Payment, paymentStatusConfig } from './types';

export const paymentColumns = [
  col.custom<Payment>(
    'Sipariş No',
    (p) => (
      <Link
        href={`/operations/orders/${p.orderId}`}
        className="font-medium text-primary-600 hover:text-primary-700"
      >
        #{p.orderNumber}
      </Link>
    ),
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
      <StatusBadge status={p.status} config={paymentStatusConfig} />
      {p.failureReason && <p className="mt-1 text-xs text-danger-600">{p.failureReason}</p>}
    </div>
  )),
  col.date<Payment>('Tarih', (p) => p.createdAt),
];
