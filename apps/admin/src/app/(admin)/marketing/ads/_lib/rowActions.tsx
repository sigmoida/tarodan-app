import { PencilIcon, TrashIcon } from '@heroicons/react/24/outline';
import type { RowActionItem } from '@/components/table';
import type { Ad } from './types';

export interface AdRowActions {
  onEdit: (ad: Ad) => void;
  onDelete: (ad: Ad) => void;
}

export function adRowMenu({ onEdit, onDelete }: AdRowActions) {
  return (ad: Ad): RowActionItem[] => [
    { label: 'Düzenle', icon: PencilIcon, onClick: () => onEdit(ad) },
    { label: 'Sil', icon: TrashIcon, onClick: () => onDelete(ad), destructive: true },
  ];
}
