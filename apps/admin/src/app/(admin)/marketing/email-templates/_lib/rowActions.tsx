import { PencilIcon } from '@heroicons/react/24/outline';
import type { RowActionItem } from '@/components/table';
import type { TemplateListItem } from './types';

export function templateRowMenu(onEdit: (key: string) => void) {
  return (t: TemplateListItem): RowActionItem[] => [
    { label: 'Düzenle', icon: PencilIcon, onClick: () => onEdit(t.key) },
  ];
}
