'use client';

import { useQuery } from '@tanstack/react-query';
import { TicketIcon, CheckCircleIcon, TagIcon, SparklesIcon } from '@heroicons/react/24/outline';
import { adminApi } from '@/lib/api';
import { MetricCard } from '@/components/MetricCard';
import { type Discount } from '../_lib/types';

/**
 * Tüm indirimler üzerinden özet metrikler. `['discounts','stats']` altında —
 * indirim mutasyonları (`invalidates: ['discounts']`) bunu da tazeler.
 */
export function DiscountsStats() {
  const { data } = useQuery({
    queryKey: ['discounts', 'stats'],
    queryFn: async () => {
      const res = await adminApi.get('/admin/discounts', { params: { limit: 1000 } });
      const list: Discount[] = res.data?.data ?? res.data ?? [];
      const total = res.data?.meta?.total ?? list.length;
      return {
        total,
        active: list.filter((d) => d.isCurrentlyValid).length,
        coupons: list.filter((d) => d.code).length,
        auto: list.filter((d) => !d.code).length,
      };
    },
    staleTime: 30_000,
  });

  const s = data ?? { total: 0, active: 0, coupons: 0, auto: 0 };

  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
      <MetricCard
        icon={TicketIcon}
        tone="info"
        label="Toplam İndirim"
        value={s.total}
        footer={<span className="text-success-700">{s.active} aktif</span>}
      />
      <MetricCard icon={CheckCircleIcon} tone="success" label="Aktif" value={s.active} />
      <MetricCard icon={TagIcon} tone="info" label="Kupon Kodları" value={s.coupons} />
      <MetricCard icon={SparklesIcon} tone="primary" label="Otomatik Kampanyalar" value={s.auto} />
    </div>
  );
}
