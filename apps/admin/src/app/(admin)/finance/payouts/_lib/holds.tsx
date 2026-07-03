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

const toneClass: Record<string, string> = {
  danger: 'border-danger-200 bg-danger-50 text-danger-700',
  warning: 'border-warning-200 bg-warning-50 text-warning-700',
  info: 'border-info-200 bg-info-50 text-info-700',
  success: 'border-success-200 bg-success-50 text-success-700',
};

export function HoldReasonBadge({ reason }: { reason: EscrowHoldReason | null }) {
  if (!reason) return <span className="text-xs text-muted">—</span>;
  return (
    <span
      title={reason.detail}
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${
        toneClass[reason.tone] ?? toneClass.info
      }`}
    >
      {reason.label}
    </span>
  );
}
