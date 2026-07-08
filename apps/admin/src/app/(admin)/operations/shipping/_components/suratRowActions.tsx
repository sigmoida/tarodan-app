import { EyeIcon, ArrowPathIcon } from '@heroicons/react/24/outline';
import type { RowActionItem } from '@/components/table';
import type { SuratShipmentRow } from '../_lib/types';

export interface SuratRowActions {
  onSync: (id: string) => void;
  onViewOrder: (orderId: string) => void;
}

export function suratRowMenu({ onSync, onViewOrder }: SuratRowActions) {
  return (r: SuratShipmentRow): RowActionItem[] => [
    { label: 'Takibi Yenile', icon: ArrowPathIcon, onClick: () => onSync(r.id) },
    r.order && { label: 'Sipariş Detayı', icon: EyeIcon, onClick: () => onViewOrder(r.order!.id) },
  ];
}
