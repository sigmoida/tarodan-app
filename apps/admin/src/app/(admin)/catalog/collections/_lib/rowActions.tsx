import { EyeIcon, EyeSlashIcon } from '@heroicons/react/24/outline';
import { editDeleteActions, type RowActionItem } from '@/components/table';
import type { Collection } from './types';

export interface CollectionRowActions {
  onToggleVisibility: (c: Collection) => void;
  onEdit: (c: Collection) => void;
  onDelete: (c: Collection) => void;
}

/** ⋮ row-menu items for a collection. Visibility toggle label flips with state. */
export function collectionRowMenu({ onToggleVisibility, onEdit, onDelete }: CollectionRowActions) {
  return (c: Collection): RowActionItem[] => [
    {
      label: c.isPublic ? 'Gizle' : 'Görünür yap',
      icon: c.isPublic ? EyeSlashIcon : EyeIcon,
      onClick: () => onToggleVisibility(c),
    },
    ...editDeleteActions(c, { onEdit, onDelete }),
  ];
}
