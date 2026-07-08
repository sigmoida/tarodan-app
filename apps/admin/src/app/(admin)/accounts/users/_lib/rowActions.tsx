import { EyeIcon, NoSymbolIcon, CheckCircleIcon } from '@heroicons/react/24/outline';
import type { RowActionItem } from '@/components/table';
import type { User } from './types';

export interface UserRowActions {
  onView: (u: User) => void;
  onBanToggle: (u: User) => void;
}

export function userRowMenu({ onView, onBanToggle }: UserRowActions) {
  return (u: User): RowActionItem[] => [
    { label: 'Detay', icon: EyeIcon, onClick: () => onView(u) },
    {
      label: u.isBanned ? 'Engeli Kaldır' : 'Engelle',
      icon: u.isBanned ? CheckCircleIcon : NoSymbolIcon,
      onClick: () => onBanToggle(u),
      destructive: !u.isBanned,
    },
  ];
}
