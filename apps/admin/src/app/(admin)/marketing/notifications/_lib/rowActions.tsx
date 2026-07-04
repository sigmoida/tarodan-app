import { XCircleIcon } from '@heroicons/react/24/outline';
import type { RowActionItem } from '@/components/table';
import type { ScheduledNotification } from './types';

export function scheduledRowMenu(onCancel: (id: string) => void) {
  return (n: ScheduledNotification): RowActionItem[] => [
    { label: 'İptal Et', icon: XCircleIcon, onClick: () => onCancel(n.id), destructive: true },
  ];
}
