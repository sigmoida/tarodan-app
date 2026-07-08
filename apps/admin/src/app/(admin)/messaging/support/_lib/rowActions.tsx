import { EyeIcon } from '@heroicons/react/24/outline';
import type { RowActionItem } from '@/components/table';
import type { GuestContact } from './types';

export function guestRowMenu(onView: (g: GuestContact) => void) {
  return (g: GuestContact): RowActionItem[] => [
    { label: 'Görüntüle', icon: EyeIcon, onClick: () => onView(g) },
  ];
}
