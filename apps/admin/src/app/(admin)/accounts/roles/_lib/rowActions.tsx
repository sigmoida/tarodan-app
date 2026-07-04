import { PencilIcon, TrashIcon } from '@heroicons/react/24/outline';
import type { RowActionItem } from '@/components/table';
import type { StaffItem } from './types';

/** Yönetici satırı ⋮ menüsü: düzenle + yetkiyi kaldır. */
export function staffRowMenu({
  onEdit,
  onRevoke,
}: {
  onEdit: (s: StaffItem) => void;
  onRevoke: (s: StaffItem) => void;
}) {
  return (s: StaffItem): RowActionItem[] => [
    { label: 'Düzenle', icon: PencilIcon, onClick: () => onEdit(s) },
    { label: 'Yetkiyi Kaldır', icon: TrashIcon, onClick: () => onRevoke(s), destructive: true },
  ];
}
