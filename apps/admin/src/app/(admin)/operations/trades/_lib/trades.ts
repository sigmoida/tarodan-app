import { tradeStatusConfig, type StatusConfig } from '@tarodan/ui';
import { statusFilterOptions } from '@/lib/utils';

export interface Trade {
  id: string;
  tradeNumber: string;
  status: string;
  initiator: { id: string; displayName: string };
  receiver: { id: string; displayName: string };
  cashAmount?: number;
  hasDispute: boolean;
  createdAt: string;
  cancelReason?: string;
}

// Ara/per-side durumlar bilerek gizli (admin için gereksiz detay; badge'de doğru görünürler).
const TRADE_FILTER_STATUSES = [
  'pending',
  'accepted',
  'rejected',
  'awaiting_payment',
  'shipping_to_warehouse',
  'at_warehouse',
  'admin_reviewing',
  'shipping_to_recipients',
  'returning',
  'both_shipped',
  'completed',
  'disputed',
  'cancelled',
];

export const statusOptions = statusFilterOptions(tradeStatusConfig, {
  keys: TRADE_FILTER_STATUSES,
});

export const disputeConfig: Record<string, StatusConfig> = {
  disputed_override: { label: 'İtirazlı', variant: 'destructive' },
};

export function mapTrades(raw: any[]): Trade[] {
  return raw.map((t: any) => ({
    id: t.id,
    tradeNumber: t.tradeNumber || `TRD-${t.id.slice(0, 8)}`,
    status: t.status,
    initiator: t.initiator || { id: '', displayName: 'Başlatan' },
    receiver: t.receiver || { id: '', displayName: 'Alıcı' },
    cashAmount: Number(t.cashAmount || 0),
    hasDispute: !!t.dispute,
    createdAt: t.createdAt,
    cancelReason: t.cancelReason ?? undefined,
  }));
}
