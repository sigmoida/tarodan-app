import { activeToggleAction, editDeleteActions, type RowActionItem } from '@/components/table';
import type { CommissionRule } from './types';

export interface CommissionRowActions {
  onEdit: (r: CommissionRule) => void;
  onDelete: (r: CommissionRule) => void;
  onToggle: (r: CommissionRule) => void;
}

export function commissionRowMenu({ onEdit, onDelete, onToggle }: CommissionRowActions) {
  return (r: CommissionRule): RowActionItem[] => [
    activeToggleAction(r.isActive, () => onToggle(r)),
    ...editDeleteActions(r, { onEdit, onDelete }),
  ];
}
