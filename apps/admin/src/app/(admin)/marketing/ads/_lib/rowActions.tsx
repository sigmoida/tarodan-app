import { editDeleteActions, type RowActionItem } from '@/components/table';
import type { Ad } from './types';

export interface AdRowActions {
  onEdit: (ad: Ad) => void;
  onDelete: (ad: Ad) => void;
}

export function adRowMenu({ onEdit, onDelete }: AdRowActions) {
  return (ad: Ad): RowActionItem[] => editDeleteActions(ad, { onEdit, onDelete });
}
