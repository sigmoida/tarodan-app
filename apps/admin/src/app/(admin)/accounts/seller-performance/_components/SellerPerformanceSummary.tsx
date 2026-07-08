'use client';

import { UsersIcon, ChartBarIcon, CubeIcon } from '@heroicons/react/24/outline';
import { useResourceList } from '@/components/list';
import { MetricCard } from '@/components/MetricCard';
import { type Seller } from '../_lib/types';

/** Summary cards — read the current page rows + total from the list context. */
export function SellerPerformanceSummary() {
  const { rows, total } = useResourceList<Seller>();

  const topByOrders = [...rows].sort(
    (a, b) => b._count.sellerOrders - a._count.sellerOrders,
  )[0];
  const productsOnPage = rows.reduce((s, x) => s + x._count.products, 0);

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      <MetricCard icon={UsersIcon} tone="info" label="Toplam Satıcı" value={total} />
      <MetricCard
        icon={ChartBarIcon}
        tone="primary"
        label="En Çok Siparişli"
        value={
          topByOrders
            ? `${topByOrders.displayName} (${topByOrders._count.sellerOrders})`
            : '—'
        }
        title={topByOrders?.displayName}
      />
      <MetricCard
        icon={CubeIcon}
        tone="success"
        label="Bu Sayfada Toplam Ürün"
        value={productsOnPage}
      />
    </div>
  );
}
