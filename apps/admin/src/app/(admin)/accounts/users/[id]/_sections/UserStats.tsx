import {
  ShoppingBagIcon,
  CubeIcon,
  ArrowPathIcon,
  ChatBubbleLeftRightIcon,
  StarIcon,
} from '@heroicons/react/24/outline';
import { type UserDetail } from '../types';

/** The six summary stat cards above the detail body. */
export function UserStats({ stats }: { stats: NonNullable<UserDetail['stats']> }) {
  const cards = [
    {
      icon: ShoppingBagIcon,
      tone: 'text-info-500',
      value: stats.ordersCount,
      label: 'Toplam Sipariş',
      sub: `${stats.buyerOrdersCount} alıcı / ${stats.sellerOrdersCount} satıcı`,
    },
    { icon: CubeIcon, tone: 'text-success-500', value: stats.productsCount, label: 'Ürün' },
    {
      icon: ArrowPathIcon,
      tone: 'text-primary-500',
      value: stats.tradesCount,
      label: 'Takas',
      sub: `${stats.initiatedTradesCount} başlatan / ${stats.receivedTradesCount} alıcı`,
    },
    {
      icon: ChatBubbleLeftRightIcon,
      tone: 'text-primary-500',
      value: stats.messagesCount,
      label: 'Mesaj',
      sub: `${stats.sentMessagesCount} gönderilen / ${stats.receivedMessagesCount} alınan`,
    },
    {
      icon: StarIcon,
      tone: 'text-warning-500',
      value: stats.receivedRatingsCount,
      label: 'Alınan Değerlendirme',
    },
    {
      icon: StarIcon,
      tone: 'text-info-500',
      value: stats.givenRatingsCount,
      label: 'Verilen Değerlendirme',
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-4 lg:grid-cols-6">
      {cards.map((c, i) => {
        const Icon = c.icon;
        return (
          <div
            key={i}
            className="rounded-xl border border-border bg-surface-elevated p-4 text-center"
          >
            <Icon className={`mx-auto mb-2 h-8 w-8 ${c.tone}`} />
            <p className="text-2xl font-bold text-heading">{c.value}</p>
            <p className="text-xs text-muted">{c.label}</p>
            {c.sub && <p className="text-xs text-muted">{c.sub}</p>}
          </div>
        );
      })}
    </div>
  );
}
