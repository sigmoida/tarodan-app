import { activeToggleAction, editDeleteActions, type RowActionItem } from '@/components/table';
import type { Brand } from './types';

export interface BrandRowActions {
  onEdit: (b: Brand) => void;
  onDelete: (b: Brand) => void;
  /** Inline aktif/pasif toggle — Durum kolonunda (menüde değil). */
  onToggle: (b: Brand) => void;
  /** Satır genişletme (modeller paneli) — Modeller kolonunda. */
  onToggleExpand: (id: string) => void;
  expandedId: string | null;
  busyId?: string | null;
}

/** ⋮ row-menu items for a brand. */
export function brandRowMenu({ onEdit, onDelete, onToggle }: BrandRowActions) {
  return (b: Brand): RowActionItem[] => [
    activeToggleAction(b.isActive, () => onToggle(b)),
    ...editDeleteActions(b, { onEdit, onDelete }),
  ];
}
