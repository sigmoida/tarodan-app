import { Badge, tradeStatusConfig } from '@tarodan/ui';
import { cancelReasonLabel } from '@/lib/utils';
import { col, type RowActionItem } from '@/components/table';
import { type Trade, disputeConfig } from './trades';

export function tradeColumns(rowMenu: (t: Trade) => RowActionItem[]) {
  return [
    col.code<Trade>('Takas No', (r) => r.tradeNumber),
    col.custom<Trade>(
      'Durum',
      (r) =>
        r.hasDispute ? (
          <Badge status="disputed_override" config={disputeConfig} label="⚠️ İtirazlı" />
        ) : (
          <div className="flex flex-col items-start gap-1">
            <Badge status={r.status} config={tradeStatusConfig} />
            {r.status === 'cancelled' && cancelReasonLabel(r.cancelReason) && (
              <span className="truncate text-xs text-muted">{cancelReasonLabel(r.cancelReason)}</span>
            )}
          </div>
        ),
      { grow: 2, minWidth: 150 },
    ),
    col.user<Trade>('Başlatan', (r) => ({
      name: r.initiator.displayName,
      href: `/accounts/users/${r.initiator.id}`,
    })),
    col.user<Trade>('Alan', (r) => ({
      name: r.receiver.displayName,
      href: `/accounts/users/${r.receiver.id}`,
    })),
    col.money<Trade>('Nakit', (r) => r.cashAmount || null, { tone: 'primary' }),
    col.date<Trade>('Tarih', (r) => r.createdAt),
    col.rowMenu<Trade>(rowMenu),
  ];
}
