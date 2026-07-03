'use client';

import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { Button, StatusBadge } from '@tarodan/ui';
import { adminApi } from '@/lib/api';
import { ResourceList } from '@/components/list';
import { col, CellCode } from '@/components/table';
import { useAdminMutation } from '@/hooks/useAdminMutation';
import { shipmentStatusConfig, formatRelative } from '../_shared';

export interface SuratShipmentRow {
  id: string;
  provider: string | null;
  trackingNumber: string | null;
  trackingUrl: string | null;
  status: string;
  providerStatusCode: number | null;
  providerRawStatus: string | null;
  updatedAt: string;
  order?: {
    id: string;
    orderNumber: string;
    buyer?: { id: string; displayName: string } | null;
  } | null;
}

/** The Sürat shipments table + the per-row "sync tracking" action. */
export function SuratShipmentsTable() {
  const router = useRouter();

  const syncTracking = useAdminMutation(
    (id: string) => adminApi.syncShipmentTracking(id),
    {
      invalidates: ['surat-shipments'],
      errorMessage: 'Takip senkronu başarısız oldu',
      onSuccess: (res) => {
        const d = (res as any)?.data;
        if (d?.ok) toast.success(d.message || 'Takip güncellendi');
        else toast(d?.message || "Sürat'tan güncelleme alınamadı");
      },
    },
  );

  const columns = [
    col.link<SuratShipmentRow>('Sipariş', (r) =>
      r.order ? { href: `/operations/orders/${r.order.id}`, label: `#${r.order.orderNumber}` } : null,
    ),
    col.text<SuratShipmentRow>('Alıcı', (r) => r.order?.buyer?.displayName),
    col.custom<SuratShipmentRow>(
      'Takip No',
      (r) =>
        r.trackingNumber && r.trackingUrl ? (
          <a
            href={r.trackingUrl}
            target="_blank"
            rel="noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="block truncate font-mono text-xs text-primary-600 hover:underline"
            title={r.trackingNumber}
          >
            {r.trackingNumber}
          </a>
        ) : (
          <CellCode value={r.trackingNumber} />
        ),
      { grow: 2 },
    ),
    col.custom<SuratShipmentRow>(
      'Sürat Durumu',
      (r) => (
        <div className="flex flex-col gap-0.5">
          <StatusBadge status={(r.status || '').toLowerCase()} config={shipmentStatusConfig} />
          {r.providerRawStatus ? (
            <span className="truncate text-xs text-muted">
              {r.providerRawStatus}
              {r.providerStatusCode != null ? ` (${r.providerStatusCode})` : ''}
            </span>
          ) : null}
        </div>
      ),
      { grow: 2, minWidth: 150 },
    ),
    col.muted<SuratShipmentRow>(
      'Son Güncelleme',
      (r) => (r.updatedAt ? formatRelative(r.updatedAt) : undefined),
      { grow: 1, minWidth: 130 },
    ),
    col.actions<SuratShipmentRow>((r) => {
      const busy = syncTracking.isPending && syncTracking.variables === r.id;
      return (
        <Button
          variant="outline"
          size="sm"
          disabled={busy}
          onClick={(e) => {
            e.stopPropagation();
            syncTracking.mutate(r.id);
          }}
        >
          {busy ? 'Yenileniyor…' : 'Takibi Yenile'}
        </Button>
      );
    }, { minWidth: 130 }),
  ];

  return (
    <ResourceList.Table
      columns={columns}
      emptyText="Sürat kargosu bulunamadı"
      onRowClick={(r) => r.order && router.push(`/operations/orders/${r.order.id}`)}
      rowClassName={(r) => (r.order ? undefined : 'cursor-default')}
    />
  );
}
