import { PencilIcon, TrashIcon } from '@heroicons/react/24/outline';
import type { RowActionItem } from '@/components/table';
import type { Category } from './types';

export interface CategoryRowActions {
  onEdit: (c: Category) => void;
  onDelete: (c: Category) => void;
}

/** ⋮ row-menu items for a category. Delete is blocked while products exist. */
export function categoryRowMenu({ onEdit, onDelete }: CategoryRowActions) {
  return (c: Category): RowActionItem[] => [
    { label: 'Düzenle', icon: PencilIcon, onClick: () => onEdit(c) },
    {
      label: 'Sil',
      icon: TrashIcon,
      onClick: () => onDelete(c),
      destructive: true,
      disabled: c.productCount > 0,
    },
  ];
}
