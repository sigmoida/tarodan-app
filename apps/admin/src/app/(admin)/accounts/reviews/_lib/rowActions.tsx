import { CheckCircleIcon, XCircleIcon, ArrowUturnLeftIcon } from '@heroicons/react/24/outline';
import type { RowActionItem } from '@/components/table';
import { type ReviewStatus } from './types';

/** Approve / revert / reject row menu shared by both review tabs. */
export function reviewRowMenu(
  status: ReviewStatus | undefined,
  onAct: (s: ReviewStatus) => void,
  isLoading = false,
): RowActionItem[] {
  const s = status ?? 'approved';
  return [
    s !== 'approved' && {
      label: 'Onayla',
      icon: CheckCircleIcon,
      onClick: () => onAct('approved'),
      isLoading,
    },
    s === 'rejected' && {
      label: 'Geri Al',
      icon: ArrowUturnLeftIcon,
      onClick: () => onAct('pending'),
      isLoading,
    },
    s !== 'rejected' && {
      label: 'Reddet',
      icon: XCircleIcon,
      onClick: () => onAct('rejected'),
      destructive: true,
      isLoading,
    },
  ];
}
