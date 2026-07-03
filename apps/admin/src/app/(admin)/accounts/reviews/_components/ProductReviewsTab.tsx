'use client';

import Image from 'next/image';
import { CheckCircleIcon } from '@heroicons/react/24/outline';
import { StatusBadge } from '@tarodan/ui';
import { adminApi } from '@/lib/api';
import { ResourceList } from '@/components/list';
import { col } from '@/components/table';
import { type Review, reviewStatusConfig, reviewStatusOptions } from '../_lib/types';
import { Stars } from './Stars';
import { ReviewActions } from './ReviewActions';
import { useReviewAction } from './useReviewAction';

export function ProductReviewsTab() {
  const { act } = useReviewAction(
    'reviews',
    (id, status) => adminApi.updateReviewStatus(id, status),
    'Yorum',
  );

  const columns = [
    col.custom<Review>(
      'Ürün',
      (r) => (
        <div className="flex items-center gap-3">
          {r.product.images?.[0] ? (
            <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded">
              <Image
                src={r.product.images[0].url}
                alt={r.product.title}
                fill
                className="object-cover"
              />
            </div>
          ) : (
            <div className="h-10 w-10 shrink-0 rounded bg-surface-alt" />
          )}
          <span
            className="min-w-0 truncate text-sm font-medium text-heading"
            title={r.product.title}
          >
            {r.product.title}
          </span>
        </div>
      ),
      { grow: 3, minWidth: 220 },
    ),
    col.custom<Review>(
      'Kullanıcı',
      (r) => (
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-100 text-xs font-bold text-primary-600">
            {r.user.displayName.charAt(0)}
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm text-heading">{r.user.displayName}</p>
            {r.isVerifiedPurchase && (
              <span className="flex items-center gap-1 text-[10px] text-success-700">
                <CheckCircleIcon className="h-3 w-3" />
                Onaylı Alıcı
              </span>
            )}
          </div>
        </div>
      ),
      { grow: 2, minWidth: 170 },
    ),
    col.custom<Review>(
      'Değerlendirme',
      (r) => (
        <div className="space-y-1">
          <Stars score={r.score} />
          {r.title && <p className="text-sm font-medium text-heading">{r.title}</p>}
          {r.review && <p className="line-clamp-3 text-sm text-muted">{r.review}</p>}
        </div>
      ),
      { grow: 3, minWidth: 240 },
    ),
    col.badge<Review>('Durum', (r) => (
      <StatusBadge status={r.status} config={reviewStatusConfig} />
    )),
    col.date<Review>('Tarih', (r) => r.createdAt),
    col.actions<Review>(
      (r) => <ReviewActions status={r.status} onAct={(s) => act(r.id, s)} />,
      { header: 'İşlemler' },
    ),
  ];

  return (
    <ResourceList<Review>
      resource="reviews"
      fetcher={(p) => adminApi.getReviews(p)}
      getRowId={(r) => r.id}
      limit={10}
      syncUrl
      initialFilters={{ status: 'all' }}
      errorMessage="Yorumlar yüklenirken hata oluştu"
    >
      <ResourceList.Toolbar>
        <ResourceList.Search placeholder="Ürün veya kullanıcı ara..." />
        <ResourceList.FilterSelect
          name="status"
          options={reviewStatusOptions}
          className="sm:w-48"
        />
      </ResourceList.Toolbar>
      <ResourceList.Table columns={columns} emptyText="Yorum bulunamadı" />
      <ResourceList.Pagination />
    </ResourceList>
  );
}
