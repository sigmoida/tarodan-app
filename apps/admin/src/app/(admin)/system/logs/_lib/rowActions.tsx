import { CheckCircleIcon } from '@heroicons/react/24/outline';
import type { RowActionItem } from '@/components/table';
import type { SecurityLog } from './types';

/** Row menu for a security log — only unresolved events expose the resolve action. */
export function securityRowMenu(onResolve: (id: string) => void, resolvingId?: string) {
  return (r: SecurityLog): RowActionItem[] => [
    !r.resolved && {
      label: 'Çöz',
      icon: CheckCircleIcon,
      onClick: () => onResolve(r.id),
      isLoading: resolvingId === r.id,
    },
  ];
}
