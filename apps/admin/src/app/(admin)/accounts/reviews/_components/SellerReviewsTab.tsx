'use client';

import { StatusBadge } from '@tarodan/ui';
import { adminApi } from '@/lib/api';
import { ResourceList } from '@/components/list';
import { col } from '@/components/table';
import { type UserRating, reviewStatusConfig, reviewStatusOptions } from '../_lib/types';
import { Stars } from './Stars';
import { ReviewActions } from './ReviewActions';
import { useReviewAction } from './useReviewAction';

export function SellerReviewsTab() {
  const { act } = useReviewAction(
    'user-ratings',
    (id, status) => adminApi.updateUserRatingStatus(id, status),
    'Satıcı yorumu',
  );

  const columns = [
    col.user<UserRating>('Gönderen', (r) => ({
      name: r.giver?.displayName ?? '—',
      secondary: r.giver?.email,
    })),
    col.user<UserRating>('Alıcı (Satıcı)', (r) => ({
      name: r.receiver?.displayName ?? '—',
      secondary: r.receiver?.email,
    })),
    col.custom<UserRating>('Puan', (r) => <Stars score={r.score} />, {
      grow: 1,
      minWidth: 120,
    }),
    col.muted<UserRating>('Yorum', (r) => r.comment || null, {
      grow: 3,
      minWidth: 220,
    }),
    col.badge<UserRating>('Durum', (r) => (
      <StatusBadge status={r.status || 'approved'} config={reviewStatusConfig} />
    )),
    col.muted<UserRating>(
      'Kaynak',
      (r) => (r.orderId ? 'Sipariş' : r.tradeId ? 'Takas' : '—'),
      { grow: 1, minWidth: 100 },
    ),
    col.date<UserRating>('Tarih', (r) => r.createdAt),
    col.actions<UserRating>(
      (r) => <ReviewActions status={r.status} onAct={(s) => act(r.id, s)} />,
      { header: 'İşlemler' },
    ),
  ];

  return (
    <ResourceList<UserRating>
      resource="user-ratings"
      fetcher={(p) => adminApi.getUserRatings(p)}
      getRowId={(r) => r.id}
      limit={10}
      syncUrl
      initialFilters={{ status: 'all' }}
      errorMessage="Satıcı yorumları yüklenirken hata oluştu"
    >
      <ResourceList.Toolbar>
        <ResourceList.Search placeholder="Kullanıcı ara..." />
        <ResourceList.FilterSelect
          name="status"
          options={reviewStatusOptions}
          className="sm:w-48"
        />
      </ResourceList.Toolbar>
      <ResourceList.Table columns={columns} emptyText="Satıcı yorumu bulunamadı" />
      <ResourceList.Pagination />
    </ResourceList>
  );
}
