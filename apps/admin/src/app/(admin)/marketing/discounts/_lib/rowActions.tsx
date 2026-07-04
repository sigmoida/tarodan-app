import { activeToggleAction, editDeleteActions, type RowActionItem } from '@/components/table';
import type { Discount } from './types';

export interface DiscountRowActions {
  onToggle: (d: Discount) => void;
  onEdit: (d: Discount) => void;
  onDelete: (d: Discount) => void;
}

/** İndirim satırı ⋮ menüsü: aktif/pasif + düzenle + sil. */
export function discountRowMenu({ onToggle, onEdit, onDelete }: DiscountRowActions) {
  return (d: Discount): RowActionItem[] => [
    activeToggleAction(d.isActive, () => onToggle(d)),
    ...editDeleteActions(d, { onEdit, onDelete }),
  ];
}
