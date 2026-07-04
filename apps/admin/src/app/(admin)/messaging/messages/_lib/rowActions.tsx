import {
  EyeIcon,
  CheckIcon,
  XMarkIcon,
  ArrowUturnLeftIcon,
  NoSymbolIcon,
} from '@heroicons/react/24/outline';
import type { RowActionItem } from '@/components/table';
import type { Message } from './types';

export interface MessageRowActions {
  onView: (m: Message) => void;
  onApprove: (m: Message) => void;
  onReject: (m: Message) => void;
  onRevert: (m: Message) => void;
  onBan: (m: Message) => void;
}

export function messageRowMenu(a: MessageRowActions) {
  return (m: Message): RowActionItem[] => [
    { label: 'Detay', icon: EyeIcon, onClick: () => a.onView(m) },
    (m.status === 'pending' || m.status === 'rejected') && {
      label: 'Onayla',
      icon: CheckIcon,
      onClick: () => a.onApprove(m),
    },
    m.status === 'rejected'
      ? { label: 'Geri Al', icon: ArrowUturnLeftIcon, onClick: () => a.onRevert(m) }
      : { label: 'Reddet', icon: XMarkIcon, onClick: () => a.onReject(m), destructive: true },
    m.senderId && {
      label: 'Göndereni yasakla',
      icon: NoSymbolIcon,
      onClick: () => a.onBan(m),
      destructive: true,
    },
  ];
}
