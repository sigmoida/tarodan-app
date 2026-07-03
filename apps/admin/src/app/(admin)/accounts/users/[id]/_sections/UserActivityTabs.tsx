'use client';

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { CubeIcon, StarIcon } from '@heroicons/react/24/outline';
import { StatusBadge } from '@tarodan/ui';
import { SectionCard } from '@/components/detail/SectionCard';
import { AdminTabs } from '@/components/AdminTabs';
import { ModerationEventsPanel } from '@/components/ModerationEventsPanel';
import { getProductEffectivePrice } from '@/lib/productPrice';
import { type UserDetail, type UserRatingItem, userStatusConfig } from '../types';

function Stars({ score }: { score: number }) {
  return (
    <div className="flex items-center gap-2">
      {[1, 2, 3, 4, 5].map((s) => (
        <StarIcon
          key={s}
          className={`h-4 w-4 ${s <= score ? 'fill-warning-500 text-warning-500' : 'text-muted'}`}
        />
      ))}
      <span className="ml-2 font-medium text-heading">{score}/5</span>
    </div>
  );
}

function RatingCard({ rating, partyLabel, party }: { rating: UserRatingItem; partyLabel: string; party?: string }) {
  return (
    <div className="rounded-lg bg-surface-alt p-4">
      <div className="mb-2 flex items-center justify-between">
        <Stars score={rating.score} />
        <span className="text-sm text-muted">
          {new Date(rating.createdAt).toLocaleDateString('tr-TR')}
        </span>
      </div>
      {rating.comment && <p className="text-muted">{rating.comment}</p>}
      <p className="mt-2 text-sm text-muted">
        {partyLabel}: {party || 'Bilinmiyor'}
      </p>
    </div>
  );
}

function EmptyLine({ children }: { children: React.ReactNode }) {
  return <p className="py-8 text-center text-muted">{children}</p>;
}

export function UserActivityTabs({ userId, user }: { userId: string; user: UserDetail }) {
  const [tab, setTab] = useState<'orders' | 'products' | 'trades' | 'ratings' | 'ai'>(
    'orders',
  );

  const tabs = [
    { key: 'orders', label: 'Siparişler', badge: user.recentOrders?.length || 0 },
    { key: 'products', label: 'Ürünler', badge: user.products?.length || 0 },
    { key: 'trades', label: 'Takaslar', badge: user.recentTrades?.length || 0 },
    { key: 'ratings', label: 'Değerlendirmeler', badge: user.receivedRatings?.length || 0 },
    { key: 'ai', label: 'AI Denetim' },
  ];

  return (
    <SectionCard bodyClassName="space-y-4">
      <AdminTabs tabs={tabs} value={tab} onChange={(k) => setTab(k as typeof tab)} />

      {tab === 'orders' &&
        (user.recentOrders && user.recentOrders.length > 0 ? (
          <div className="space-y-3">
            {user.recentOrders.map((order) => (
              <div
                key={order.id}
                className="flex items-center justify-between rounded-lg bg-surface-alt p-4"
              >
                <div className="flex-1">
                  <div className="flex items-center gap-3">
                    <span
                      className={`rounded px-2 py-1 text-xs font-medium ${
                        order.role === 'buyer'
                          ? 'bg-info-500/20 text-info-700'
                          : 'bg-success-500/20 text-success-700'
                      }`}
                    >
                      {order.role === 'buyer' ? 'Alıcı' : 'Satıcı'}
                    </span>
                    <Link
                      href={`/operations/orders/${order.id}`}
                      className="font-medium text-heading hover:text-primary-600"
                    >
                      {order.orderNumber || `#${order.id.slice(0, 8)}`}
                    </Link>
                    <StatusBadge status={order.status} config={userStatusConfig} />
                  </div>
                  <p className="mt-1 text-sm text-muted">
                    {order.role === 'buyer' ? 'Satıcı' : 'Alıcı'}:{' '}
                    {order.otherParty?.displayName || 'Bilinmiyor'}
                    {order.product && ` • ${order.product.title}`}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-medium text-heading">
                    ₺{order.totalAmount.toLocaleString('tr-TR')}
                  </p>
                  <p className="text-xs text-muted">
                    {new Date(order.createdAt).toLocaleDateString('tr-TR')}
                  </p>
                </div>
              </div>
            ))}
            <Link
              href={`/operations/orders?userId=${user.id}`}
              className="block py-2 text-center text-primary-600 hover:underline"
            >
              Tüm siparişleri görüntüle →
            </Link>
          </div>
        ) : (
          <EmptyLine>Henüz sipariş yok</EmptyLine>
        ))}

      {tab === 'products' &&
        (user.products && user.products.length > 0 ? (
          <div className="space-y-3">
            {user.products.map((product) => (
              <div
                key={product.id}
                className="flex items-center gap-4 rounded-lg bg-surface-alt p-4"
              >
                {product.imageUrl ? (
                  <Image
                    src={product.imageUrl}
                    alt={product.title}
                    width={60}
                    height={60}
                    className="rounded-lg object-cover"
                  />
                ) : (
                  <div className="flex h-[60px] w-[60px] items-center justify-center rounded-lg bg-surface">
                    <CubeIcon className="h-6 w-6 text-muted" />
                  </div>
                )}
                <div className="flex-1">
                  <Link
                    href={`/catalog/products/${product.id}`}
                    className="font-medium text-heading hover:text-primary-600"
                  >
                    {product.title}
                  </Link>
                  <div className="mt-1 flex items-center gap-2">
                    <StatusBadge status={product.status} config={userStatusConfig} />
                    <span className="text-sm text-muted">
                      {new Date(product.createdAt).toLocaleDateString('tr-TR')}
                    </span>
                  </div>
                </div>
                <p className="font-medium text-heading">
                  ₺{getProductEffectivePrice(product).toLocaleString('tr-TR')}
                </p>
              </div>
            ))}
            <Link
              href={`/catalog/products?sellerId=${user.id}`}
              className="block py-2 text-center text-primary-600 hover:underline"
            >
              Tüm ürünleri görüntüle →
            </Link>
          </div>
        ) : (
          <EmptyLine>Henüz ürün yok</EmptyLine>
        ))}

      {tab === 'trades' &&
        (user.recentTrades && user.recentTrades.length > 0 ? (
          <div className="space-y-3">
            {user.recentTrades.map((trade) => (
              <div key={trade.id} className="rounded-lg bg-surface-alt p-4">
                <div className="mb-2 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span
                      className={`rounded px-2 py-1 text-xs font-medium ${
                        trade.role === 'initiator'
                          ? 'bg-primary-500/20 text-primary-700'
                          : 'bg-info-500/20 text-info-400'
                      }`}
                    >
                      {trade.role === 'initiator' ? 'Başlatan' : 'Alıcı'}
                    </span>
                    <Link
                      href={`/operations/trades/${trade.id}`}
                      className="font-medium text-heading hover:text-primary-600"
                    >
                      {trade.tradeNumber || `#${trade.id.slice(0, 8)}`}
                    </Link>
                    <StatusBadge status={trade.status} config={userStatusConfig} />
                  </div>
                  <span className="text-sm text-muted">
                    {new Date(trade.createdAt).toLocaleDateString('tr-TR')}
                  </span>
                </div>
                <div className="text-sm text-muted">
                  <p>
                    Karşı taraf:{' '}
                    {trade.role === 'initiator'
                      ? trade.receiver?.displayName
                      : trade.initiator?.displayName}
                  </p>
                  <p className="mt-1">
                    Teklif: {trade.initiatorItems.length} ürün ↔ {trade.receiverItems.length} ürün
                    {trade.cashAmount != null &&
                      trade.cashAmount > 0 &&
                      ` + ₺${trade.cashAmount.toLocaleString('tr-TR')}`}
                  </p>
                </div>
              </div>
            ))}
            <Link
              href={`/operations/trades?userId=${user.id}`}
              className="block py-2 text-center text-primary-600 hover:underline"
            >
              Tüm takasları görüntüle →
            </Link>
          </div>
        ) : (
          <EmptyLine>Henüz takas yok</EmptyLine>
        ))}

      {tab === 'ratings' && (
        <div className="space-y-4">
          <h3 className="font-medium text-heading">Alınan Değerlendirmeler</h3>
          {user.receivedRatings && user.receivedRatings.length > 0 ? (
            <div className="space-y-3">
              {user.receivedRatings.map((rating) => (
                <RatingCard
                  key={rating.id}
                  rating={rating}
                  partyLabel="Değerlendiren"
                  party={rating.giver?.displayName || 'Anonim'}
                />
              ))}
            </div>
          ) : (
            <p className="py-4 text-muted">Henüz değerlendirme yok</p>
          )}

          <h3 className="mt-6 font-medium text-heading">Verilen Değerlendirmeler</h3>
          {user.givenRatings && user.givenRatings.length > 0 ? (
            <div className="space-y-3">
              {user.givenRatings.map((rating) => (
                <RatingCard
                  key={rating.id}
                  rating={rating}
                  partyLabel="Değerlendirilen"
                  party={rating.receiver?.displayName || 'Bilinmiyor'}
                />
              ))}
            </div>
          ) : (
            <p className="py-4 text-muted">Henüz değerlendirme vermemiş</p>
          )}
        </div>
      )}

      {tab === 'ai' && (
        <ModerationEventsPanel
          entityType="user"
          entityId={userId}
          chrome={false}
        />
      )}
    </SectionCard>
  );
}
