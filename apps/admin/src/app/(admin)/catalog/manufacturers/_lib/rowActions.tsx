import { activeToggleAction, editDeleteActions, type RowActionItem } from '@/components/table';
import type { Manufacturer } from './types';

export interface ManufacturerRowActions {
  onEdit: (m: Manufacturer) => void;
  onDelete: (m: Manufacturer) => void;
  /** Inline aktif/pasif toggle — Durum kolonunda (menüde değil). */
  onToggle: (m: Manufacturer) => void;
  busyId?: string | null;
}

/** ⋮ row-menu items for a manufacturer. */
export function manufacturerRowMenu({ onEdit, onDelete, onToggle }: ManufacturerRowActions) {
  return (m: Manufacturer): RowActionItem[] => [
    activeToggleAction(m.isActive, () => onToggle(m)),
    ...editDeleteActions(m, { onEdit, onDelete }),
  ];
}
