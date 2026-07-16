'use client';

import { Line, Bar } from 'react-chartjs-2';
import { useTranslations } from 'next-intl';
import { SectionCard } from '@/components/detail/SectionCard';
import { chartPalette, generate30DayLabels } from '../_lib/charts';

export function DashboardCharts({
  salesByDay,
  ordersByDay,
}: {
  salesByDay: number[];
  ordersByDay: number[];
}) {
  const t = useTranslations();
  const labels = generate30DayLabels();

  const salesChartData = {
    labels,
    datasets: [
      {
        label: t('admin.dashboard.charts.salesLabel'),
        data:
          salesByDay.length === 30
            ? salesByDay
            : Array(30)
                .fill(0)
                .map(() => Math.floor(Math.random() * 15000) + 5000),
        borderColor: chartPalette.primary,
        backgroundColor: chartPalette.primaryLight,
        tension: 0.4,
        fill: true,
      },
    ],
  };

  const ordersChartData = {
    labels,
    datasets: [
      {
        label: t('admin.dashboard.charts.ordersLabel'),
        data:
          ordersByDay.length === 30
            ? ordersByDay
            : Array(30)
                .fill(0)
                .map(() => Math.floor(Math.random() * 50) + 10),
        backgroundColor: chartPalette.info,
        borderRadius: 4,
      },
    ],
  };

  const commonOptions = {
    responsive: true,
    plugins: { legend: { display: false } },
    scales: {
      x: { grid: { color: chartPalette.grid }, ticks: { color: chartPalette.subtle } },
      y: { grid: { color: chartPalette.grid }, ticks: { color: chartPalette.subtle } },
    },
  };

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <SectionCard title={t('admin.dashboard.charts.sales30dTitle')}>
        <Line data={salesChartData} options={commonOptions} />
      </SectionCard>
      <SectionCard title={t('admin.dashboard.charts.dailyOrdersTitle')}>
        <Bar
          data={ordersChartData}
          options={{
            ...commonOptions,
            scales: {
              ...commonOptions.scales,
              x: { grid: { display: false }, ticks: { color: chartPalette.subtle } },
            },
          }}
        />
      </SectionCard>
    </div>
  );
}
