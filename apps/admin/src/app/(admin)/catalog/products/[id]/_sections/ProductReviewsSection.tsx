'use client';

import { format } from 'date-fns';
import { tr } from 'date-fns/locale';
import { StarIcon, CheckCircleIcon, XCircleIcon } from '@heroicons/react/24/outline';
import { StarIcon as StarIconSolid } from '@heroicons/react/24/solid';
import { IconButton } from '@tarodan/ui';
import { adminApi } from '@/lib/api';
import { useAdminMutation } from '@/hooks/useAdminMutation';
import { SectionCard } from '@/components/detail/SectionCard';
import type { Review } from '../_lib/types';

function Stars({ score }: { score: number }) {
  return (
    <div className="flex text-warning-500">
      {[...Array(5)].map((_, i) =>
        i < score ? (
          <StarIconSolid key={i} className="h-4 w-4" />
        ) : (
          <StarIcon key={i} className="h-4 w-4" />
        ),
      )}
    </div>
  );
}

function ReviewStatusBadge({ status }: { status: string }) {
  const map: Record<string, [string, string]> = {
    approved: ['bg-success-100 text-success-700', 'Onaylı'],
    pending: ['bg-warning-100 text-warning-700', 'Bekliyor'],
    rejected: ['bg-danger-100 text-danger-700', 'Reddedildi'],
  };
  const [cls, label] = map[status] ?? ['bg-surface-alt text-body', status];
  return <span className={`rounded-full px-2 py-1 text-xs ${cls}`}>{label}</span>;
}

export function ProductReviewsSection({
  productId,
  reviews,
}: {
  productId: string;
  reviews: Review[];
}) {
  const update = useAdminMutation(
    (v: { id: string; status: string }) => adminApi.updateReviewStatus(v.id, v.status),
    { invalidates: ['product-reviews'], successMessage: 'Yorum durumu güncellendi' },
  );

  return (
    <SectionCard title="Ürün Yorumları" icon={StarIcon} bodyClassName="space-y-4">
      {reviews.length === 0 ? (
        <p className="py-8 text-center text-muted">Bu ürün için henüz yorum yok.</p>
      ) : (
        <div className="divide-y divide-border">
          {reviews.map((review) => (
            <div key={review.id} className="flex items-start justify-between gap-4 py-4 first:pt-0">
              <div className="flex min-w-0 items-start gap-4">
                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-primary-100 font-bold text-primary-600">
                  {review.user.displayName.charAt(0)}
                </div>
                <div className="min-w-0">
                  <div className="mb-1 flex flex-wrap items-center gap-2">
                    <span className="font-medium text-heading">{review.user.displayName}</span>
                    {review.isVerifiedPurchase && (
                      <span className="flex items-center gap-1 text-xs text-success-600">
                        <CheckCircleIcon className="h-3 w-3" /> Onaylı Alıcı
                      </span>
                    )}
                    <ReviewStatusBadge status={review.status} />
                  </div>
                  <div className="mb-2 flex items-center gap-2">
                    <Stars score={review.score} />
                    <span className="text-sm text-muted">
                      {format(new Date(review.createdAt), 'dd MMM yyyy', { locale: tr })}
                    </span>
                  </div>
                  {review.title && <p className="mb-1 font-medium text-heading">{review.title}</p>}
                  {review.review && <p className="text-muted">{review.review}</p>}
                </div>
              </div>
              <div className="flex flex-shrink-0 items-center gap-2">
                {review.status !== 'approved' && (
                  <IconButton
                    variant="ghost"
                    aria-label="Onayla"
                    title="Onayla"
                    onClick={() => update.mutate({ id: review.id, status: 'approved' })}
                  >
                    <CheckCircleIcon className="h-5 w-5 text-success-600" />
                  </IconButton>
                )}
                {review.status !== 'rejected' && (
                  <IconButton
                    variant="ghost"
                    aria-label="Reddet"
                    title="Reddet"
                    onClick={() => update.mutate({ id: review.id, status: 'rejected' })}
                  >
                    <XCircleIcon className="h-5 w-5 text-danger-600" />
                  </IconButton>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </SectionCard>
  );
}
