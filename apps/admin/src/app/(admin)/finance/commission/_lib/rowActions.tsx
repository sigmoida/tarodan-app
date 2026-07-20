import { activeToggleAction, editDeleteActions, type RowActionItem } from '@/components/table';
import type { CommissionRule } from './types';

export interface CommissionRowActions {
  onEdit: (r: CommissionRule) => void;
  onDelete: (r: CommissionRule) => void;
  onToggle: (r: CommissionRule) => void;
  togglingId?: string;
}

export function commissionRowMenu({ onEdit, onDelete, onToggle, togglingId }: CommissionRowActions) {
  return (r: CommissionRule): RowActionItem[] => [
    activeToggleAction(r.isActive, () => onToggle(r), togglingId === r.id),
    ...editDeleteActions(r, { onEdit, onDelete }),
  ];
}
