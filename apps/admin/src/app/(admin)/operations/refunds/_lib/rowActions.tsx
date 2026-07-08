import { EyeIcon } from '@heroicons/react/24/outline';
import type { RowActionItem } from '@/components/table';
import type { Refund } from './columns';

export function refundRowMenu(onViewOrder: (orderId: string) => void) {
  return (r: Refund): RowActionItem[] => [
    r.order && { label: 'Sipariş Detayı', icon: EyeIcon, onClick: () => onViewOrder(r.order!.id) },
  ];
}
