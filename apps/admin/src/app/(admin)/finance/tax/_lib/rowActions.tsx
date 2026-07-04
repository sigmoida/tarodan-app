import { TrashIcon } from '@heroicons/react/24/outline';
import type { RowActionItem } from '@/components/table';
import type { VatOverride } from './types';

export function vatOverrideRowMenu(onDelete: (o: VatOverride) => void) {
  return (o: VatOverride): RowActionItem[] => [
    { label: 'Sil', icon: TrashIcon, onClick: () => onDelete(o), destructive: true },
  ];
}
