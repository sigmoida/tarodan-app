import {
  ShoppingBagIcon,
  CurrencyDollarIcon,
  ChartBarIcon,
  UsersIcon,
} from '@heroicons/react/24/outline';
import { useTranslations } from 'next-intl';
import { MetricCard } from '@/components/MetricCard';
import { type DashboardStats as Stats } from '../_lib/types';

export function DashboardStats({ stats }: { stats: Stats }) {
  const t = useTranslations();
  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
      <MetricCard
        icon={ShoppingBagIcon}
        tone="info"
        label={t('admin.dashboard.stats.totalOrders')}
        value={stats.totalOrders.toLocaleString()}
        change={stats.ordersChange}
      />
      <MetricCard
        icon={CurrencyDollarIcon}
        tone="success"
        label={t('admin.dashboard.stats.commissionRevenue')}
        value={`₺${stats.totalCommission.toLocaleString()}`}
        change={stats.commissionChange}
      />
      <MetricCard
        icon={ChartBarIcon}
        tone="primary"
        label={t('admin.dashboard.stats.activeProducts')}
        value={stats.activeProducts.toLocaleString()}
        change={stats.productsChange}
      />
      <MetricCard
        icon={UsersIcon}
        tone="primary"
        label={t('admin.dashboard.stats.totalUsers')}
        value={stats.totalUsers.toLocaleString()}
        change={stats.usersChange}
      />
    </div>
  );
}
