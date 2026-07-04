import { EyeIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline';
import type { RowActionItem } from '@/components/table';
import type { Trade } from './trades';

/** Row menu for a trade — resolution happens on the detail page, so both items navigate. */
export function tradeRowMenu(onView: (t: Trade) => void) {
  return (t: Trade): RowActionItem[] => [
    { label: 'Detay', icon: EyeIcon, onClick: () => onView(t) },
    t.hasDispute && {
      label: 'İtirazı Çöz',
      icon: ExclamationTriangleIcon,
      onClick: () => onView(t),
      destructive: true,
    },
  ];
}
