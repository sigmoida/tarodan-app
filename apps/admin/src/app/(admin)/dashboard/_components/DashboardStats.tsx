import {
  ShoppingBagIcon,
  CurrencyDollarIcon,
  ChartBarIcon,
  UsersIcon,
} from '@heroicons/react/24/outline';
import { MetricCard } from '@/components/MetricCard';
import { type DashboardStats as Stats } from '../_lib/types';

export function DashboardStats({ stats }: { stats: Stats }) {
  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
      <MetricCard
        icon={ShoppingBagIcon}
        tone="info"
        label="Toplam Satış"
        value={stats.totalOrders.toLocaleString()}
        change={stats.ordersChange}
      />
      <MetricCard
        icon={CurrencyDollarIcon}
        tone="success"
        label="Komisyon Geliri"
        value={`₺${stats.totalCommission.toLocaleString()}`}
        change={stats.commissionChange}
      />
      <MetricCard
        icon={ChartBarIcon}
        tone="primary"
        label="Aktif Ürünler"
        value={stats.activeProducts.toLocaleString()}
        change={stats.productsChange}
      />
      <MetricCard
        icon={UsersIcon}
        tone="primary"
        label="Toplam Kullanıcı"
        value={stats.totalUsers.toLocaleString()}
        change={stats.usersChange}
      />
    </div>
  );
}
