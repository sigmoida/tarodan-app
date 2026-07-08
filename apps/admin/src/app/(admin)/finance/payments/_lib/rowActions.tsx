import { EyeIcon } from '@heroicons/react/24/outline';
import type { RowActionItem } from '@/components/table';
import type { Payment } from './types';

export function paymentRowMenu(onView: (p: Payment) => void) {
  return (p: Payment): RowActionItem[] => [
    { label: 'Detay', icon: EyeIcon, onClick: () => onView(p) },
  ];
}
