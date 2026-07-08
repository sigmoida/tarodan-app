import Link from 'next/link';
import { StatusBadge } from '@tarodan/ui';
import { SectionCard } from '@/components/detail/SectionCard';
import {
  type RecentOrder,
  dashboardOrderStatusConfig,
  formatRelativeDate,
} from '../_lib/types';

export function RecentOrders({ orders }: { orders: RecentOrder[] }) {
  return (
    <SectionCard
      title="Son Siparişler"
      className="lg:col-span-2"
      actions={
        <Link href="/operations/orders" className="text-sm text-primary-600 hover:underline">
          Tümünü Gör →
        </Link>
      }
    >
      <div className="space-y-3">
        {orders.length > 0 ? (
          orders.map((order) => (
            <div
              key={order.id}
              className="flex items-center justify-between border-b border-border py-3 last:border-0"
            >
              <div className="flex min-w-0 flex-1 items-center">
                <div className="mr-3 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary-100">
                  <span className="text-sm font-medium text-primary-600">
                    {order.buyerName?.charAt(0) || '?'}
                  </span>
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm text-heading">
                    <span className="font-medium">{order.orderNumber}</span>
                  </p>
                  <p className="truncate text-xs text-muted">
                    {order.buyerName} - {order.productTitle}
                  </p>
                </div>
              </div>
              <div className="ml-3 flex items-center gap-3">
                <span className="whitespace-nowrap text-sm font-semibold text-heading">
                  ₺{order.amount.toLocaleString('tr-TR')}
                </span>
                <StatusBadge status={order.status} config={dashboardOrderStatusConfig} />
                <span className="whitespace-nowrap text-xs text-muted">
                  {formatRelativeDate(order.createdAt)}
                </span>
              </div>
            </div>
          ))
        ) : (
          <div className="py-8 text-center text-muted">Henüz sipariş bulunmuyor</div>
        )}
      </div>
    </SectionCard>
  );
}
