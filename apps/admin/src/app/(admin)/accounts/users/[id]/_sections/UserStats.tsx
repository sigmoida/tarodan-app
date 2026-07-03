import {
  ShoppingBagIcon,
  CubeIcon,
  ArrowPathIcon,
  ChatBubbleLeftRightIcon,
  StarIcon,
} from '@heroicons/react/24/outline';
import { MetricCard, type MetricTone } from '@/components/MetricCard';
import { type UserDetail } from '../types';

/** The six summary stat cards above the detail body. */
export function UserStats({ stats }: { stats: NonNullable<UserDetail['stats']> }) {
  const cards: {
    icon: typeof ShoppingBagIcon;
    tone: MetricTone;
    value: number;
    label: string;
    sub?: string;
  }[] = [
    {
      icon: ShoppingBagIcon,
      tone: 'info',
      value: stats.ordersCount,
      label: 'Toplam Sipariş',
      sub: `${stats.buyerOrdersCount} alıcı / ${stats.sellerOrdersCount} satıcı`,
    },
    { icon: CubeIcon, tone: 'success', value: stats.productsCount, label: 'Ürün' },
    {
      icon: ArrowPathIcon,
      tone: 'primary',
      value: stats.tradesCount,
      label: 'Takas',
      sub: `${stats.initiatedTradesCount} başlatan / ${stats.receivedTradesCount} alıcı`,
    },
    {
      icon: ChatBubbleLeftRightIcon,
      tone: 'primary',
      value: stats.messagesCount,
      label: 'Mesaj',
      sub: `${stats.sentMessagesCount} gönderilen / ${stats.receivedMessagesCount} alınan`,
    },
    {
      icon: StarIcon,
      tone: 'warning',
      value: stats.receivedRatingsCount,
      label: 'Alınan Değerlendirme',
    },
    {
      icon: StarIcon,
      tone: 'info',
      value: stats.givenRatingsCount,
      label: 'Verilen Değerlendirme',
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-4 lg:grid-cols-6">
      {cards.map((c, i) => (
        <MetricCard
          key={i}
          icon={c.icon}
          tone={c.tone}
          label={c.label}
          value={c.value}
          footer={c.sub ? <span className="text-muted">{c.sub}</span> : undefined}
        />
      ))}
    </div>
  );
}
