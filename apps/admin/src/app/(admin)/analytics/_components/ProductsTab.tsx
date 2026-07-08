'use client';

import { Doughnut } from 'react-chartjs-2';
import {
  ShoppingBagIcon,
  ChartBarIcon,
  CalendarIcon,
  CurrencyDollarIcon,
} from '@heroicons/react/24/outline';
import { MetricCard } from '@/components/MetricCard';
import { SectionCard } from '@/components/detail/SectionCard';
import { chartPalette } from '../_lib/charts';

export function ProductsTab({ report }: { report: any }) {
  const categoryChartData = {
    labels: report.categoryDistribution?.map((d: any) => d.name) || [],
    datasets: [
      {
        data: report.categoryDistribution?.map((d: any) => d.percentage) || [],
        backgroundColor: [
          chartPalette.primary,
          chartPalette.info,
          chartPalette.success,
          chartPalette.warning,
          chartPalette.danger,
          chartPalette.primaryDark,
        ],
        borderWidth: 0,
      },
    ],
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          icon={ShoppingBagIcon}
          tone="info"
          label="Toplam Ürün"
          value={report.totalProducts?.toLocaleString() ?? 0}
        />
        <MetricCard
          icon={ChartBarIcon}
          tone="success"
          label="Aktif Ürünler"
          value={report.activeProducts?.toLocaleString() ?? 0}
        />
        <MetricCard
          icon={CalendarIcon}
          tone="warning"
          label="Onay Bekleyen"
          value={report.pendingProducts?.toLocaleString() ?? 0}
        />
        <MetricCard
          icon={CurrencyDollarIcon}
          tone="primary"
          label="Ort. Fiyat"
          value={`₺${report.averagePrice?.toFixed(2) ?? 0}`}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <SectionCard title="Kategori Dağılımı">
          <div className="h-80">
            <Doughnut
              data={categoryChartData}
              options={{
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                  legend: {
                    position: 'right',
                    labels: { color: chartPalette.subtle },
                  },
                },
              }}
            />
          </div>
        </SectionCard>

        <SectionCard title="Kategorilere Göre Ürünler">
          <div className="space-y-4">
            {report.categoryDistribution?.map((cat: any) => (
              <div key={cat.name} className="flex items-center justify-between">
                <span className="text-heading">{cat.name}</span>
                <div className="flex items-center gap-3">
                  <div className="h-2 w-32 rounded-full bg-surface-alt">
                    <div
                      className="h-2 rounded-full bg-primary-500"
                      style={{ width: `${cat.percentage}%` }}
                    />
                  </div>
                  <span className="w-12 text-right text-sm text-muted">{cat.count}</span>
                </div>
              </div>
            ))}
          </div>
        </SectionCard>
      </div>
    </div>
  );
}
