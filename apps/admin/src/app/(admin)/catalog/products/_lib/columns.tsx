import Image from 'next/image';
import {
  StatusBadge,
  productStatusConfig,
  productConditionConfig,
  enumLabel,
} from '@tarodan/ui';
import {
  CheckIcon,
  XMarkIcon,
  TrashIcon,
  ArrowUturnLeftIcon,
} from '@heroicons/react/24/outline';
import { col, Empty } from '@/components/table';
import { ActionIconButton } from '@/components/AdminList';
import {
  getProductEffectivePrice,
  isProductOnSaleDisplay,
  getProductOriginalPriceForDisplay,
} from '@/lib/product-price';
import { fmtTry } from '@/lib/format';
import { AiBadge } from '../_components/AiBadge';
import type { Product } from './types';

const PLACEHOLDER = 'https://placehold.co/100x100/f3f4f6/666?text=Ürün';

export interface ProductRowActions {
  onApprove: (p: Product) => void;
  onReject: (p: Product) => void;
  onDelete: (p: Product) => void;
  onRestore: (p: Product) => void;
}

export function productColumns({ onApprove, onReject, onDelete, onRestore }: ProductRowActions) {
  return [
    col.custom<Product>(
      'Ürün',
      (p) => (
        <div className="flex min-w-0 items-center gap-3">
          <Image
            src={p.imageUrl || PLACEHOLDER}
            alt=""
            width={40}
            height={40}
            unoptimized
            className="h-10 w-10 flex-shrink-0 rounded-lg bg-surface-alt object-cover"
          />
          <span className="truncate font-medium text-heading">{p.title}</span>
        </div>
      ),
      { grow: 3, minWidth: 220 },
    ),
    col.custom<Product>(
      'Fiyat',
      (p) => (
        <span className="whitespace-nowrap font-medium tabular-nums text-primary-600">
          {isProductOnSaleDisplay(p) && (
            <span className="block text-sm text-muted line-through">
              {fmtTry(getProductOriginalPriceForDisplay(p))}
            </span>
          )}
          {fmtTry(getProductEffectivePrice(p))}
        </span>
      ),
      { align: 'right', minWidth: 120 },
    ),
    col.badge<Product>('Durum', (p) => <StatusBadge status={p.status} config={productStatusConfig} />),
    col.badge<Product>('AI', (p) => (p.aiCheckStatus ? <AiBadge status={p.aiCheckStatus} /> : <Empty />)),
    col.muted<Product>('Kondisyon', (p) => enumLabel(productConditionConfig, p.condition)),
    col.user<Product>('Satıcı', (p) => ({
      name: p.seller.displayName,
      href: `/accounts/users/${p.seller.id}`,
    })),
    col.text<Product>('Kategori', (p) => p.category.name),
    col.date<Product>('Tarih', (p) => p.createdAt),
    col.actions<Product>((p) => (
      <>
        {p.status === 'pending' && (
          <>
            <ActionIconButton icon={CheckIcon} onClick={() => onApprove(p)} title="Onayla" variant="success" />
            <ActionIconButton icon={XMarkIcon} onClick={() => onReject(p)} title="Reddet" variant="danger" />
          </>
        )}
        {p.status === 'deleted' ? (
          <ActionIconButton
            icon={ArrowUturnLeftIcon}
            onClick={() => onRestore(p)}
            title="Geri Yükle"
            variant="success"
          />
        ) : (
          p.status !== 'sold' &&
          p.status !== 'reserved' && (
            <ActionIconButton icon={TrashIcon} onClick={() => onDelete(p)} title="Kaldır" variant="danger" />
          )
        )}
      </>
    )),
  ];
}
