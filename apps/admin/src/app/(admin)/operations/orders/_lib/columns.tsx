import Link from 'next/link';
import { Button, Badge, orderStatusConfig } from '@tarodan/ui';
import { ShoppingBagIcon, ChevronDownIcon, ChevronUpIcon } from '@heroicons/react/24/outline';
import { cancelReasonLabel, orderOriginLabel } from '@/lib/utils';
import { col, CellText, CellUser, type RowActionItem } from '@/components/table';
import { type Order } from './orders';

export interface OrderColumnProps {
  expandedGroups: Set<string>;
  toggleGroup: (gid: string) => void;
  rowMenu: (o: Order) => RowActionItem[];
}

export function orderColumns({ expandedGroups, toggleGroup, rowMenu }: OrderColumnProps) {
  return [
    col.custom<Order>(
      'Sipariş No',
      (o) => {
        if (o.isGroupSummary && o.checkoutGroupId) {
          const gid = o.checkoutGroupId;
          const isOpen = expandedGroups.has(gid);
          return (
            <Button
              type="button"
              variant="ghost"
              onClick={(e) => {
                e.stopPropagation();
                toggleGroup(gid);
              }}
              aria-expanded={isOpen}
              title={isOpen ? 'Sepeti kapat' : 'Sepeti aç'}
              className="-mx-1 h-auto w-fit gap-1 rounded px-1 py-0.5 text-[11px] font-medium uppercase tracking-wide text-primary-600 hover:bg-primary-100 hover:text-primary-700"
            >
              <ShoppingBagIcon className="h-3.5 w-3.5" />
              {o.groupItemCount} ürünlük sepet
              {isOpen ? (
                <ChevronUpIcon className="h-3.5 w-3.5" />
              ) : (
                <ChevronDownIcon className="h-3.5 w-3.5" />
              )}
            </Button>
          );
        }
        return (
          <Link
            href={`/operations/orders/${o.id}`}
            className="block truncate font-mono text-sm text-primary-600 hover:underline"
          >
            {o.orderNumber}
          </Link>
        );
      },
      { grow: 2, minWidth: 150 },
    ),
    col.custom<Order>(
      'Durum',
      (o) =>
        o.isGroupSummary ? (
          <span
            className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
              o.groupStatus === 'done'
                ? 'bg-success-100 text-success-700'
                : 'bg-info-100 text-info-700'
            }`}
          >
            {o.groupStatus === 'done' ? 'Bitti' : 'Devam ediyor'}
          </span>
        ) : (
          <div className="flex flex-col items-start gap-1">
            {o.activeRefundRequest ? (
              <Badge status="refund_requested" config={orderStatusConfig} label="İade Sürecinde" />
            ) : o.cancellationType === 'iptal' ? (
              <Badge status="cancelled" config={orderStatusConfig} label="İptal Edildi" />
            ) : (
              <Badge status={o.status} config={orderStatusConfig} />
            )}
            {(o.status === 'cancelled' || o.cancellationType === 'iptal') &&
              cancelReasonLabel(o.cancelReason) && (
                <span className="truncate text-xs text-muted">
                  {cancelReasonLabel(o.cancelReason)} · {orderOriginLabel(o.offerId)} iptali
                </span>
              )}
          </div>
        ),
      { grow: 2, minWidth: 170 },
    ),
    col.user<Order>('Alıcı', (o) => ({
      name: o.buyer.displayName,
      href: `/accounts/users/${o.buyer.id}`,
    })),
    col.custom<Order>('Satıcı', (o) => {
      if (o.isGroupSummary) {
        const sellers = o.groupSellers ?? [];
        const first = sellers[0];
        const extra = Math.max(0, sellers.length - 1);
        return (
          <span className="flex items-center gap-1 text-sm text-body">
            <CellText value={first?.displayName} />
            {extra > 0 && (
              <span className="rounded bg-surface-alt px-1 text-xs text-muted">+{extra}</span>
            )}
          </span>
        );
      }
      return <CellUser name={o.seller.displayName} href={`/accounts/users/${o.seller.id}`} />;
    }),
    col.custom<Order>(
      'Ürün',
      (o) => {
        if (o.isGroupSummary) {
          const thumbs = o.groupThumbs ?? [];
          const extra = o.groupItemCount - thumbs.length;
          return (
            <div className="flex items-center gap-1">
              {thumbs.length > 0 ? (
                thumbs.map((src, i) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={i}
                    src={src}
                    alt=""
                    className="h-8 w-8 rounded border border-border-subtle bg-surface-alt object-cover"
                  />
                ))
              ) : (
                <span className="flex h-8 w-8 items-center justify-center rounded border border-border-subtle bg-surface-alt text-muted">
                  <ShoppingBagIcon className="h-4 w-4" />
                </span>
              )}
              {extra > 0 && (
                <span className="flex h-8 min-w-8 items-center justify-center rounded border border-border-subtle bg-surface-alt px-1 text-[11px] font-medium text-muted">
                  +{extra}
                </span>
              )}
            </div>
          );
        }
        return <CellText value={o.product?.title || `${o.itemCount} adet`} />;
      },
      { grow: 2 },
    ),
    col.money<Order>('Tutar', (o) => (o.isGroupSummary ? o.groupTotalAmount ?? 0 : o.totalAmount), {
      tone: 'primary',
    }),
    col.money<Order>(
      'Komisyon',
      (o) => (o.isGroupSummary ? o.groupCommission ?? 0 : o.commission),
      { tone: 'positive' },
    ),
    col.date<Order>('Tarih', (o) => o.createdAt),
    col.rowMenu<Order>(rowMenu),
  ];
}
