import { activeToggleAction, editDeleteActions, type RowActionItem } from '@/components/table';
import type { Discount } from './types';

export interface DiscountRowActions {
  onToggle: (d: Discount) => void;
  onEdit: (d: Discount) => void;
  onDelete: (d: Discount) => void;
  busyId?: string;
}

/** Discount row ⋮ menu: active/inactive + edit + delete. */
export function discountRowMenu({ onToggle, onEdit, onDelete, busyId }: DiscountRowActions) {
  return (d: Discount): RowActionItem[] => [
    activeToggleAction(d.isActive, () => onToggle(d), busyId === d.id),
    ...editDeleteActions(d, { onEdit, onDelete }),
  ];
}
