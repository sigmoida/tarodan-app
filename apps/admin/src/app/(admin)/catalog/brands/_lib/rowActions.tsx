import { activeToggleAction, editDeleteActions, type RowActionItem } from '@/components/table';
import type { Brand } from './types';

export interface BrandRowActions {
  onEdit: (b: Brand) => void;
  onDelete: (b: Brand) => void;
  /** Inline active/inactive toggle — in the Status column (not the menu). */
  onToggle: (b: Brand) => void;
  /** Row expansion (models panel) — in the Models column. */
  onToggleExpand: (id: string) => void;
  expandedId: string | null;
  busyId?: string | null;
}

/** ⋮ row-menu items for a brand. */
export function brandRowMenu({ onEdit, onDelete, onToggle, busyId }: BrandRowActions) {
  return (b: Brand): RowActionItem[] => [
    activeToggleAction(b.isActive, () => onToggle(b), busyId === b.id),
    ...editDeleteActions(b, { onEdit, onDelete }),
  ];
}
