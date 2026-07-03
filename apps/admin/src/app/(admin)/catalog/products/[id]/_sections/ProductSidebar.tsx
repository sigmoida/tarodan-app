import Link from 'next/link';
import { Button } from '@tarodan/ui';
import {
  CheckCircleIcon,
  XCircleIcon,
  TrashIcon,
  ArrowUturnLeftIcon,
} from '@heroicons/react/24/outline';
import { SectionCard } from '@/components/detail/SectionCard';
import type { ProductDetail } from '../_lib/types';

export interface ProductSidebarProps {
  product: ProductDetail;
  onApprove: () => void;
  onReject: () => void;
  onRestore: () => void;
  onDelete: () => void;
  busyRestore?: boolean;
  busyDelete?: boolean;
}

export function ProductSidebar({
  product,
  onApprove,
  onReject,
  onRestore,
  onDelete,
  busyRestore,
  busyDelete,
}: ProductSidebarProps) {
  const canApprove = product.status === 'pending';
  const canReject = product.status === 'pending';
  const canRestore = product.status === 'deleted';
  const canDelete =
    product.status !== 'sold' && product.status !== 'reserved' && product.status !== 'deleted';

  return (
    <>
      <SectionCard title="İşlemler" bodyClassName="space-y-2">
        {canApprove && (
          <Button
            variant="success"
            onClick={onApprove}
            leftIcon={<CheckCircleIcon className="h-5 w-5" />}
            className="w-full justify-center"
          >
            Onayla
          </Button>
        )}
        {canReject && (
          <Button
            variant="danger"
            onClick={onReject}
            leftIcon={<XCircleIcon className="h-5 w-5" />}
            className="w-full justify-center"
          >
            Reddet
          </Button>
        )}
        {canRestore && (
          <Button
            variant="success"
            onClick={onRestore}
            isLoading={busyRestore}
            leftIcon={<ArrowUturnLeftIcon className="h-5 w-5" />}
            className="w-full justify-center"
          >
            Geri Yükle
          </Button>
        )}
        {canDelete && (
          <Button
            variant="secondary"
            onClick={onDelete}
            isLoading={busyDelete}
            leftIcon={<TrashIcon className="h-5 w-5" />}
            className="w-full justify-center"
          >
            Kaldır
          </Button>
        )}
      </SectionCard>

      <SectionCard title="Hızlı Linkler" bodyClassName="space-y-2">
        <Link
          href={`/users/${product.seller.id}`}
          className="block rounded-lg px-4 py-2 text-body transition-colors hover:bg-surface"
        >
          Satıcıyı Görüntüle
        </Link>
        <Link
          href={`/operations/orders?productId=${product.id}`}
          className="block rounded-lg px-4 py-2 text-body transition-colors hover:bg-surface"
        >
          Siparişleri Görüntüle
        </Link>
      </SectionCard>
    </>
  );
}
