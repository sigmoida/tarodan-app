'use client';

import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Button, StatusBadge, tradeStatusConfig } from '@tarodan/ui';
import { ExclamationTriangleIcon } from '@heroicons/react/24/outline';
import { cancelReasonLabel } from '@/lib/utils';
import { DataTable } from '@/components/DataTable';
import { col } from '@/components/table';
import { useResourceList } from '@/components/list';
import { type Trade, mapTrades, disputeConfig } from '../_lib/trades';

const columns = [
  col.code<Trade>('Takas No', (r) => r.tradeNumber),
  col.custom<Trade>(
    'Durum',
    (r) =>
      r.hasDispute ? (
        <StatusBadge status="disputed_override" config={disputeConfig} label="⚠️ İtirazlı" />
      ) : (
        <div className="flex flex-col items-start gap-1">
          <StatusBadge status={r.status} config={tradeStatusConfig} />
          {r.status === 'cancelled' && cancelReasonLabel(r.cancelReason) && (
            <span className="truncate text-xs text-muted">{cancelReasonLabel(r.cancelReason)}</span>
          )}
        </div>
      ),
    { grow: 2, minWidth: 150 },
  ),
  col.user<Trade>('Başlatan', (r) => ({
    name: r.initiator.displayName,
    href: `/users/${r.initiator.id}`,
  })),
  col.user<Trade>('Alan', (r) => ({
    name: r.receiver.displayName,
    href: `/users/${r.receiver.id}`,
  })),
  col.money<Trade>('Nakit', (r) => r.cashAmount || null, { tone: 'primary' }),
  col.date<Trade>('Tarih', (r) => r.createdAt),
  col.actions<Trade>(
    (r) =>
      r.hasDispute ? (
        <Button
          variant="secondary"
          className="rounded-lg p-2 text-danger-600 hover:bg-danger-500/10"
          title="İtirazı Çöz"
        >
          <ExclamationTriangleIcon className="h-5 w-5" />
        </Button>
      ) : null,
    { header: 'İşlemler' },
  ),
];

export function TradesTable() {
  const router = useRouter();
  const { rows, isLoading } = useResourceList<any>();
  const trades = useMemo(() => mapTrades(rows), [rows]);

  return (
    <DataTable
      columns={columns}
      data={trades}
      loading={isLoading}
      emptyText="Takas bulunamadı"
      getRowId={(t) => t.id}
      onRowClick={(t) => router.push(`/operations/trades/${t.id}`)}
      rowClassName={(t) => (t.hasDispute ? 'bg-danger-900/10' : '')}
    />
  );
}
