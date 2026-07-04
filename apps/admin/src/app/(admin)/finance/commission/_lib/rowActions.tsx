import { PencilIcon, TrashIcon } from '@heroicons/react/24/outline';
import { activeToggleAction, type RowActionItem } from '@/components/table';
import type { CommissionRule } from './types';

export interface CommissionRowActions {
  onEdit: (r: CommissionRule) => void;
  onDelete: (r: CommissionRule) => void;
  onToggle: (r: CommissionRule) => void;
}

export function commissionRowMenu({ onEdit, onDelete, onToggle }: CommissionRowActions) {
  return (r: CommissionRule): RowActionItem[] => [
    activeToggleAction(r.isActive, () => onToggle(r)),
    { label: 'Düzenle', icon: PencilIcon, onClick: () => onEdit(r) },
    { label: 'Sil', icon: TrashIcon, onClick: () => onDelete(r), destructive: true },
  ];
}
