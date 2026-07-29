import { PencilIcon, TrashIcon } from '@heroicons/react/24/outline';
import { useTranslations } from 'next-intl';
import type { RowActionItem } from '@/components/table';
import type { StaffItem } from './types';

type T = ReturnType<typeof useTranslations<never>>;

/** Staff row ⋮ menu: edit + revoke access. */
export function staffRowMenu(
  t: T,
  {
    onEdit,
    onRevoke,
  }: {
    onEdit: (s: StaffItem) => void;
    onRevoke: (s: StaffItem) => void;
  },
) {
  return (s: StaffItem): RowActionItem[] => [
    { label: t('common.edit'), icon: PencilIcon, onClick: () => onEdit(s) },
    {
      label: t('admin.roles.revokeAccess'),
      icon: TrashIcon,
      onClick: () => onRevoke(s),
      destructive: true,
    },
  ];
}
