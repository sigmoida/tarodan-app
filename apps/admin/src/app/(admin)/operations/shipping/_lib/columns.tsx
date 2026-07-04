import { Badge } from '@tarodan/ui';
import { col, CellCode, Empty, type RowActionItem } from '@/components/table';
import { shipmentStatusConfig, legLabels, formatRelative } from '../_shared';
import type {
  OrderShipmentRow,
  ReturnShipmentRow,
  TradeShipmentRow,
  SuratShipmentRow,
} from './types';

export const orderShipmentColumns = [
  col.link<OrderShipmentRow>('Sipariş', (r) =>
    r.order ? { href: `/operations/orders/${r.order.id}`, label: `#${r.order.orderNumber}` } : null,
  ),
  col.text<OrderShipmentRow>('Alıcı', (r) => r.order?.buyer?.displayName),
  col.muted<OrderShipmentRow>('Kargo', (r) => r.provider),
  col.custom<OrderShipmentRow>(
    'Takip No',
    (r) =>
      r.trackingNumber && r.trackingUrl ? (
        <a
          href={r.trackingUrl}
          target="_blank"
          rel="noreferrer"
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
  col.badge<OrderShipmentRow>('Durum', (r) => (
    <Badge status={(r.status || '').toLowerCase()} config={shipmentStatusConfig} />
  )),
];

export const returnShipmentColumns = [
  col.link<ReturnShipmentRow>('İade No', (r) => ({
    href: `/operations/refund-requests/${r.id}`,
    label: r.refundNumber,
  })),
  col.link<ReturnShipmentRow>('Sipariş', (r) =>
    r.order ? { href: `/operations/orders/${r.order.id}`, label: r.order.orderNumber } : null,
  ),
  col.text<ReturnShipmentRow>('Kargo', (r) => r.returnProvider, { grow: 1 }),
  col.code<ReturnShipmentRow>('Takip No', (r) => r.returnTrackingNumber),
  col.badge<ReturnShipmentRow>('Durum', (r) =>
    r.returnStatus ? <Badge status={r.returnStatus} config={shipmentStatusConfig} /> : <Empty />,
  ),
  col.date<ReturnShipmentRow>('Kargoya Verildi', (r) => r.returnShippedAt),
  col.date<ReturnShipmentRow>('Teslim', (r) => r.returnDeliveredAt),
];

export const tradeShipmentColumns = [
  col.link<TradeShipmentRow>('Takas No', (r) =>
    r.trade
      ? {
          href: `/operations/trades/${r.trade.id}`,
          label: r.trade.tradeNumber || `#${r.trade.id.slice(0, 8)}`,
        }
      : null,
  ),
  col.text<TradeShipmentRow>('Yön', (r) => legLabels[r.leg] || r.leg, { grow: 2 }),
  col.text<TradeShipmentRow>('Kargo', (r) => r.carrier, { grow: 1 }),
  col.code<TradeShipmentRow>('Takip No', (r) => r.trackingNumber),
  col.badge<TradeShipmentRow>('Durum', (r) => (
    <Badge status={r.status} config={shipmentStatusConfig} />
  )),
  col.user<TradeShipmentRow>('Gönderici', (r) =>
    r.shipper ? { name: r.shipper.displayName, href: `/accounts/users/${r.shipper.id}` } : null,
  ),
  col.muted<TradeShipmentRow>('Güncelleme', (r) => formatRelative(r.updatedAt), {
    grow: 1,
    minWidth: 130,
  }),
];

export function suratShipmentColumns(rowMenu: (r: SuratShipmentRow) => RowActionItem[]) {
  return [
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
          <Badge status={(r.status || '').toLowerCase()} config={shipmentStatusConfig} />
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
    col.rowMenu<SuratShipmentRow>(rowMenu),
  ];
}
