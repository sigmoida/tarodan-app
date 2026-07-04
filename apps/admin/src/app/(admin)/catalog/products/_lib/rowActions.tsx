import {
  EyeIcon,
  CheckIcon,
  XMarkIcon,
  ArrowUturnLeftIcon,
  TrashIcon,
} from '@heroicons/react/24/outline';
import type { RowActionItem } from '@/components/table';
import type { Product } from './types';

export interface ProductRowActions {
  onView: (p: Product) => void;
  onApprove: (p: Product) => void;
  onReject: (p: Product) => void;
  onDelete: (p: Product) => void;
  onRestore: (p: Product) => void;
}

/** ⋮ row-menu items for a product — status-gated; destructive ones grouped last. */
export function productRowMenu(a: ProductRowActions) {
  return (p: Product): RowActionItem[] => [
    { label: 'Detay', icon: EyeIcon, onClick: () => a.onView(p) },
    p.status === 'pending' && { label: 'Onayla', icon: CheckIcon, onClick: () => a.onApprove(p) },
    p.status === 'pending' && {
      label: 'Reddet',
      icon: XMarkIcon,
      onClick: () => a.onReject(p),
      destructive: true,
    },
    p.status === 'deleted' && {
      label: 'Geri Yükle',
      icon: ArrowUturnLeftIcon,
      onClick: () => a.onRestore(p),
    },
    p.status !== 'deleted' &&
      p.status !== 'sold' &&
      p.status !== 'reserved' && {
        label: 'Kaldır',
        icon: TrashIcon,
        onClick: () => a.onDelete(p),
        destructive: true,
      },
  ];
}
