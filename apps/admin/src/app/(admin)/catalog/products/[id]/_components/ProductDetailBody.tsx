'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { CubeIcon, StarIcon } from '@heroicons/react/24/outline';
import { adminApi } from '@/lib/api';
import { AdminTabs } from '@/components/AdminTabs';
import { ModerationEventsPanel } from '@/components/ModerationEventsPanel';
import { useConfirm } from '@/components/ConfirmProvider';
import { useAdminMutation } from '@/lib/query/useAdminMutation';
import type { ProductDetail, Review } from '../_lib/types';
import { ProductImagesSection } from '../_sections/ProductImagesSection';
import { ProductInfoSection } from '../_sections/ProductInfoSection';
import { ProductSellerSection } from '../_sections/ProductSellerSection';
import { ProductSidebar } from '../_sections/ProductSidebar';
import { ProductReviewsSection } from '../_sections/ProductReviewsSection';
import { ProductApproveModal } from '../_modals/ProductApproveModal';
import { ProductRejectModal } from '../_modals/ProductRejectModal';

type Tab = 'info' | 'reviews' | 'ai';

export function ProductDetailBody({ product }: { product: ProductDetail }) {
  const router = useRouter();
  const confirm = useConfirm();
  const [tab, setTab] = useState<Tab>('info');
  const [approveOpen, setApproveOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);

  const { data: reviews = [] } = useQuery<Review[]>({
    queryKey: ['product-reviews', product.id],
    queryFn: async () => (await adminApi.getReviews({ productId: product.id, limit: 50 })).data.data ?? [],
  });
  const reviewCount = reviews.filter((r) => r.status !== 'deleted').length;

  const del = useAdminMutation(() => adminApi.deleteProduct(product.id), {
    invalidates: ['products'],
    successMessage: 'Ürün kaldırıldı',
    onSuccess: () => router.push('/catalog/products'),
  });
  const restore = useAdminMutation(() => adminApi.restoreProduct(product.id), {
    invalidates: ['products'],
    successMessage: 'Ürün geri yüklendi (onay bekliyor)',
  });

  const onDelete = async () => {
    if (
      await confirm({
        title: 'Ürünü kaldır',
        description:
          'Ürün listelerden kaldırılacak (Kaldırıldı durumuna alınır). İstediğinde Geri Yükle ile geri getirebilirsin.',
        confirmLabel: 'Kaldır',
        destructive: true,
      })
    )
      del.mutate();
  };
  const onRestore = async () => {
    if (
      await confirm({
        title: 'Ürünü geri yükle',
        description: 'Ürün yeniden onaya (Beklemede) düşecek ve onaylandıktan sonra yayınlanacak.',
        confirmLabel: 'Geri Yükle',
      })
    )
      restore.mutate();
  };

  return (
    <>
      <AdminTabs
        tabs={[
          { key: 'info', label: 'Ürün Bilgileri', icon: CubeIcon },
          { key: 'reviews', label: 'Yorumlar', icon: StarIcon, badge: reviewCount },
          { key: 'ai', label: 'AI Denetim' },
        ]}
        value={tab}
        onChange={(k) => setTab(k as Tab)}
      />

      {tab === 'info' && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2">
            <ProductImagesSection product={product} />
            <ProductInfoSection product={product} />
            <ProductSellerSection seller={product.seller} />
          </div>
          <div className="space-y-6">
            <ProductSidebar
              product={product}
              onApprove={() => setApproveOpen(true)}
              onReject={() => setRejectOpen(true)}
              onRestore={onRestore}
              onDelete={onDelete}
              busyRestore={restore.isPending}
              busyDelete={del.isPending}
            />
          </div>
        </div>
      )}

      {tab === 'reviews' && <ProductReviewsSection productId={product.id} reviews={reviews} />}

      {tab === 'ai' && (
        <ModerationEventsPanel
          entityType="product"
          entityId={product.id}
          title="AI Denetim"
          description="Bu ürüne ait tüm AI moderasyon olayları"
        />
      )}

      <ProductApproveModal open={approveOpen} onClose={() => setApproveOpen(false)} productId={product.id} />
      <ProductRejectModal open={rejectOpen} onClose={() => setRejectOpen(false)} productId={product.id} />
    </>
  );
}
