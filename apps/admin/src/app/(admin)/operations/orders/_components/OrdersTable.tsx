'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button, Select, StatusBadge, orderStatusConfig } from '@tarodan/ui';
import {
  PencilIcon,
  CheckIcon,
  XMarkIcon,
  ShoppingBagIcon,
  ChevronDownIcon,
  ChevronUpIcon,
} from '@heroicons/react/24/outline';
import { cancelReasonLabel, orderOriginLabel } from '@/lib/utils';
import { adminApi } from '@/lib/api';
import { DataTable } from '@/components/DataTable';
import { col, CellText, CellUser } from '@/components/table';
import { ActionIconButton } from '@/components/AdminList';
import { useResourceList } from '@/components/list';
import { useAdminMutation } from '@/hooks/useAdminMutation';
import { type Order, mapOrders, useOrderGroups } from '../_lib/orders';

/**
 * The orders table — the page's unique logic (checkout-group accordion + inline
 * status edit) lives here, reading rows from the ResourceList context.
 */
export function OrdersTable() {
  const router = useRouter();
  const { rows, isLoading, search, filters } = useResourceList<any>();

  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [editingOrderId, setEditingOrderId] = useState<string | null>(null);
  const [newStatus, setNewStatus] = useState('');

  const toggleGroup = (gid: string) =>
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(gid)) next.delete(gid);
      else next.add(gid);
      return next;
    });

  const orders = useMemo(() => mapOrders(rows), [rows]);
  const { displayRows, rowClassById } = useOrderGroups(orders, expandedGroups);

  const update = useAdminMutation(
    (vars: { orderId: string; status: string }) =>
      adminApi.updateOrderStatus(vars.orderId, vars.status),
    {
      invalidates: ['orders'],
      successMessage: 'Sipariş durumu güncellendi',
      errorMessage: 'Durum güncellenemedi',
      onSuccess: () => setEditingOrderId(null),
    },
  );
  const startEditing = (o: Order) => {
    setEditingOrderId(o.id);
    setNewStatus(o.status);
  };
  const cancelEditing = () => {
    setEditingOrderId(null);
    setNewStatus('');
  };
  const saveStatus = (orderId: string) => {
    if (newStatus) update.mutate({ orderId, status: newStatus });
  };

  const columns = [
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
        ) : editingOrderId === o.id ? (
          <div className="flex items-center gap-1.5">
            <Select
              value={newStatus}
              onChange={(e) => setNewStatus(e.target.value)}
              className="w-32"
              selectSize="sm"
              disabled={update.isPending}
            >
              <option value="pending_payment">Ödeme Bekliyor</option>
              <option value="paid">Ödendi</option>
              <option value="preparing">Hazırlanıyor</option>
              <option value="shipped">Kargoda</option>
              <option value="delivered">Teslim Edildi</option>
              <option value="completed">Tamamlandı</option>
              <option value="cancelled">İptal</option>
            </Select>
            <Button
              variant="secondary"
              onClick={() => saveStatus(o.id)}
              disabled={update.isPending}
              className="rounded p-1 text-success-600 hover:bg-success-50"
              title="Kaydet"
            >
              <CheckIcon className="h-4 w-4" />
            </Button>
            <Button
              variant="secondary"
              onClick={cancelEditing}
              disabled={update.isPending}
              className="rounded p-1 text-danger-500 hover:bg-danger-50"
              title="İptal"
            >
              <XMarkIcon className="h-4 w-4" />
            </Button>
          </div>
        ) : (
          <div className="flex flex-col items-start gap-1">
            {o.activeRefundRequest ? (
              <StatusBadge status="refund_requested" config={orderStatusConfig} label="İade Sürecinde" />
            ) : o.cancellationType === 'iptal' ? (
              <StatusBadge status="cancelled" config={orderStatusConfig} label="İptal Edildi" />
            ) : (
              <StatusBadge status={o.status} config={orderStatusConfig} />
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
    col.money<Order>(
      'Tutar',
      (o) => (o.isGroupSummary ? o.groupTotalAmount ?? 0 : o.totalAmount),
      { tone: 'primary' },
    ),
    col.money<Order>(
      'Komisyon',
      (o) => (o.isGroupSummary ? o.groupCommission ?? 0 : o.commission),
      { tone: 'positive' },
    ),
    col.date<Order>('Tarih', (o) => o.createdAt),
    col.actions<Order>(
      (o) =>
        o.isGroupSummary ? null : (
          <ActionIconButton
            icon={PencilIcon}
            onClick={() => startEditing(o)}
            title="Durumu Değiştir"
          />
        ),
      { header: 'İşlemler' },
    ),
  ];

  const emptyText =
    search || filters.status !== 'all' || filters.userId
      ? 'Filtreye uygun sipariş bulunamadı'
      : 'Henüz sipariş yok';

  return (
    <DataTable
      columns={columns}
      data={displayRows}
      loading={isLoading}
      rowClassName={(o) => rowClassById.get(o.id)}
      emptyText={emptyText}
      getRowId={(o) => o.id}
      onRowClick={(o) => {
        if (o.isGroupSummary) {
          if (o.checkoutGroupId) toggleGroup(o.checkoutGroupId);
          return;
        }
        if (editingOrderId === o.id) return;
        router.push(`/operations/orders/${o.id}`);
      }}
    />
  );
}
