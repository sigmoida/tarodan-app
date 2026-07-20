import { EyeIcon, CheckCircleIcon, XCircleIcon } from '@heroicons/react/24/outline';
import type { RowActionItem } from '@/components/table';
import { type Application } from './types';

export interface ApplicationRowActions {
  expandedId: string | null;
  onToggleExpand: (a: Application) => void;
  onApprove: (a: Application) => void;
  onReject: (a: Application) => void;
  busyId?: string;
}

export function applicationRowMenu({
  expandedId,
  onToggleExpand,
  onApprove,
  onReject,
  busyId,
}: ApplicationRowActions) {
  return (a: Application): RowActionItem[] => [
    {
      label: expandedId === a.id ? 'Detayı Gizle' : 'Detayı Göster',
      icon: EyeIcon,
      onClick: () => onToggleExpand(a),
    },
    a.businessStatus === 'pending' && {
      label: 'Onayla',
      icon: CheckCircleIcon,
      onClick: () => onApprove(a),
      isLoading: busyId === a.id,
    },
    a.businessStatus === 'pending' && {
      label: 'Reddet',
      icon: XCircleIcon,
      onClick: () => onReject(a),
      destructive: true,
      isLoading: busyId === a.id,
    },
  ];
}
