import { CheckCircleIcon } from '@heroicons/react/24/outline';
import type { RowActionItem } from '@/components/table';
import { holdReasonForRow } from './holds';
import type { PayoutTransaction } from './types';

/** Row menu for a payout transaction — only held rows can be released, blocked by locks/refunds. */
export function transactionRowMenu(onRelease: (orderId: string) => void) {
  return (t: PayoutTransaction): RowActionItem[] => {
    if (t.status !== 'held') return [];
    const reason = holdReasonForRow({ status: t.status, releaseAt: t.releaseAt });
    const blocked = reason?.code === 'frozen' || reason?.code === 'open_refund';
    return [
      {
        label: 'Serbest Bırak',
        icon: CheckCircleIcon,
        onClick: () => onRelease(t.orderId),
        disabled: blocked,
      },
    ];
  };
}
