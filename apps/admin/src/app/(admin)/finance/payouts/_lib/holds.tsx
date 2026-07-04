import { Badge } from '@tarodan/ui';
import { describeHoldReason, type EscrowHoldReason } from '@/lib/escrow';

/**
 * Infer the payout hold reason from a row (payouts don't carry frozenByRefundId):
 * no releaseAt → awaiting delivery; future releaseAt → escrow window; past + held → lock.
 */
export function holdReasonForRow(args: {
  status: string;
  releaseAt: string | null;
}): EscrowHoldReason | null {
  if (args.status !== 'held') return null;
  const overdue = args.releaseAt != null && new Date(args.releaseAt).getTime() <= Date.now();
  return describeHoldReason({
    hasOpenRefund: overdue,
    releaseAt: args.releaseAt,
    deliveredAt: args.releaseAt ? new Date().toISOString() : null,
  });
}

export function HoldReasonBadge({ reason }: { reason: EscrowHoldReason | null }) {
  if (!reason) return <span className="text-xs text-muted">—</span>;
  return (
    <Badge variant={reason.tone} size="sm" title={reason.detail}>
      {reason.label}
    </Badge>
  );
}
