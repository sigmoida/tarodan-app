'use client';

import { UsersIcon, ChartBarIcon, CubeIcon } from '@heroicons/react/24/outline';
import { useResourceList } from '@/components/list';
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
      <div className="flex items-center gap-4 rounded-xl border border-border bg-surface-elevated p-4">
        <div className="shrink-0 rounded-lg bg-info-500/10 p-3">
          <UsersIcon className="h-6 w-6 text-info-500" />
        </div>
        <div>
          <p className="text-sm text-muted">Toplam Satıcı</p>
          <p className="text-xl font-bold text-heading">{total}</p>
        </div>
      </div>

      <div className="flex items-center gap-4 rounded-xl border border-border bg-surface-elevated p-4">
        <div className="shrink-0 rounded-lg bg-primary-500/10 p-3">
          <ChartBarIcon className="h-6 w-6 text-primary-500" />
        </div>
        <div className="min-w-0">
          <p className="text-sm text-muted">En Çok Siparişli</p>
          <p className="truncate text-sm font-bold text-heading" title={topByOrders?.displayName}>
            {topByOrders
              ? `${topByOrders.displayName} (${topByOrders._count.sellerOrders})`
              : '—'}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-4 rounded-xl border border-border bg-surface-elevated p-4">
        <div className="shrink-0 rounded-lg bg-success-500/10 p-3">
          <CubeIcon className="h-6 w-6 text-success-500" />
        </div>
        <div>
          <p className="text-sm text-muted">Bu Sayfada Toplam Ürün</p>
          <p className="text-xl font-bold text-heading">{productsOnPage}</p>
        </div>
      </div>
    </div>
  );
}
