import { PencilIcon, TrashIcon } from '@heroicons/react/24/outline';
import { activeToggleAction, type RowActionItem } from '@/components/table';
import type { CarModel } from './types';

export interface CarModelRowActions {
  onEdit: (m: CarModel) => void;
  onDelete: (m: CarModel) => void;
  /** Inline aktif/pasif toggle — Durum kolonunda (menüde değil). */
  onToggle: (m: CarModel) => void;
  busyId?: string | null;
}

/** ⋮ row-menu items for a car model. */
export function carModelRowMenu({ onEdit, onDelete, onToggle }: CarModelRowActions) {
  return (m: CarModel): RowActionItem[] => [
    activeToggleAction(m.isActive, () => onToggle(m)),
    { label: 'Düzenle', icon: PencilIcon, onClick: () => onEdit(m) },
    { label: 'Sil', icon: TrashIcon, onClick: () => onDelete(m), destructive: true },
  ];
}
