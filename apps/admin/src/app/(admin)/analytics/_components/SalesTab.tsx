'use client';

import { Line, Bar } from 'react-chartjs-2';
import {
  ShoppingBagIcon,
  CurrencyDollarIcon,
  ChartBarIcon,
  ArrowTrendingUpIcon,
} from '@heroicons/react/24/outline';
import { MetricCard } from '@/components/MetricCard';
import { SectionCard } from '@/components/detail/SectionCard';
import { chartPalette, chartOptions } from '../_lib/charts';
import { ORDER_STATUS_LABELS } from '../_lib/types';

export function SalesTab({ report }: { report: any }) {
  const labels = report.dailyData?.map((d: any) => d.date.slice(5)) || [];

  const salesChartData = {
    labels,
    datasets: [
      {
        label: 'Satışlar (₺)',
        data: report.dailyData?.map((d: any) => d.revenue) || [],
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
        label: 'Siparişler',
        data: report.dailyData?.map((d: any) => d.orders) || [],
        backgroundColor: chartPalette.info,
        borderRadius: 4,
      },
    ],
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          icon={ShoppingBagIcon}
          tone="info"
          label="Toplam Sipariş"
          value={report.totalOrders?.toLocaleString() ?? 0}
        />
        <MetricCard
          icon={CurrencyDollarIcon}
          tone="success"
          label="Toplam Gelir"
          value={`₺${report.totalRevenue?.toLocaleString() ?? 0}`}
        />
        <MetricCard
          icon={ChartBarIcon}
          tone="primary"
          label="Komisyon Geliri"
          value={`₺${report.totalCommission?.toLocaleString() ?? 0}`}
        />
        <MetricCard
          icon={ArrowTrendingUpIcon}
          tone="primary"
          label="Ort. Sipariş Tutarı"
          value={`₺${report.averageOrderValue?.toFixed(2) ?? 0}`}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <SectionCard title="Gelir Grafiği">
          <div className="h-80">
            <Line data={salesChartData} options={chartOptions} />
          </div>
        </SectionCard>
        <SectionCard title="Sipariş Sayısı">
          <div className="h-80">
            <Bar data={ordersChartData} options={chartOptions} />
          </div>
        </SectionCard>
      </div>

      <SectionCard title="Sipariş Durumu Dağılımı">
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {Object.entries(report.ordersByStatus || {}).map(([status, count]) => (
            <div key={status} className="rounded-lg bg-surface-alt p-4 text-center">
              <p className="text-2xl font-bold text-heading">{String(count)}</p>
              <p className="text-sm text-muted">
                {ORDER_STATUS_LABELS[status] ?? status}
              </p>
            </div>
          ))}
        </div>
      </SectionCard>
    </div>
  );
}
