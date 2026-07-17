import { EyeIcon, NoSymbolIcon, CheckCircleIcon } from '@heroicons/react/24/outline';
import { useTranslations } from 'next-intl';
import type { RowActionItem } from '@/components/table';
import type { User } from './types';

type T = ReturnType<typeof useTranslations<never>>;

export interface UserRowActions {
  onView: (u: User) => void;
  onBanToggle: (u: User) => void;
}

export function userRowMenu(t: T, { onView, onBanToggle }: UserRowActions) {
  return (u: User): RowActionItem[] => [
    { label: t('admin.operations.common.detail'), icon: EyeIcon, onClick: () => onView(u) },
    {
      label: u.isBanned ? t('admin.users.unbanAction') : t('admin.users.banAction'),
      icon: u.isBanned ? CheckCircleIcon : NoSymbolIcon,
      onClick: () => onBanToggle(u),
      destructive: !u.isBanned,
    },
  ];
}
