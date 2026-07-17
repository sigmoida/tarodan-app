'use client';

import { Line } from 'react-chartjs-2';
import {
  UsersIcon,
  ArrowTrendingUpIcon,
  ChartBarIcon,
  ShoppingBagIcon,
} from '@heroicons/react/24/outline';
import { useTranslations } from 'next-intl';
import { MetricCard } from '@/components/MetricCard';
import { SectionCard } from '@/components/detail/SectionCard';
import { chartPalette, chartOptions } from '../_lib/charts';

export function UsersTab({ report }: { report: any }) {
  const t = useTranslations();
  const userGrowthData = {
    labels: report.userGrowth?.map((d: any) => d.month) || [],
    datasets: [
      {
        label: t('admin.analytics.users.newUsers'),
        data: report.userGrowth?.map((d: any) => d.users) || [],
        borderColor: chartPalette.info,
        backgroundColor: chartPalette.infoLight,
        tension: 0.4,
        fill: true,
      },
    ],
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          icon={UsersIcon}
          tone="info"
          label={t('admin.analytics.users.totalUsers')}
          value={report.totalUsers?.toLocaleString() ?? 0}
        />
        <MetricCard
          icon={ArrowTrendingUpIcon}
          tone="success"
          label={t('admin.analytics.users.newUsers')}
          value={report.newUsers?.toLocaleString() ?? 0}
        />
        <MetricCard
          icon={ChartBarIcon}
          tone="primary"
          label={t('admin.analytics.users.activeUsers')}
          value={report.activeUsers?.toLocaleString() ?? 0}
        />
        <MetricCard
          icon={ShoppingBagIcon}
          tone="primary"
          label={t('admin.analytics.users.sellers')}
          value={report.sellerCount?.toLocaleString() ?? 0}
        />
      </div>

      <SectionCard title={t('admin.analytics.users.growthTitle')}>
        <div className="h-80">
          <Line data={userGrowthData} options={chartOptions} />
        </div>
      </SectionCard>
    </div>
  );
}
