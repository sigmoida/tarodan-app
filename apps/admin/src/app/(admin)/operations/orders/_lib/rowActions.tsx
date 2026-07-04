import { EyeIcon, PencilSquareIcon } from '@heroicons/react/24/outline';
import type { RowActionItem } from '@/components/table';
import type { Order } from './orders';

export interface OrderRowActions {
  onView: (o: Order) => void;
  onEditStatus: (o: Order) => void;
}

/** Row menu for an order — checkout-group summary rows expose no actions. */
export function orderRowMenu({ onView, onEditStatus }: OrderRowActions) {
  return (o: Order): RowActionItem[] => {
    if (o.isGroupSummary) return [];
    return [
      { label: 'Detay', icon: EyeIcon, onClick: () => onView(o) },
      { label: 'Durum Güncelle', icon: PencilSquareIcon, onClick: () => onEditStatus(o) },
    ];
  };
}
