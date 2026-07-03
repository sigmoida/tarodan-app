'use client';

import {
  ArrowsRightLeftIcon,
  ChartBarIcon,
  CalendarIcon,
  CurrencyDollarIcon,
} from '@heroicons/react/24/outline';
import { MetricCard } from '@/components/MetricCard';
import { SectionCard } from '@/components/detail/SectionCard';

export function TradesTab({ report }: { report: any }) {
  const successRate =
    report.totalTrades && report.completedTrades
      ? ((report.completedTrades / report.totalTrades) * 100).toFixed(1)
      : 0;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          icon={ArrowsRightLeftIcon}
          tone="info"
          label="Toplam Takas"
          value={report.totalTrades?.toLocaleString() ?? 0}
        />
        <MetricCard
          icon={ChartBarIcon}
          tone="success"
          label="Tamamlanan"
          value={report.completedTrades?.toLocaleString() ?? 0}
        />
        <MetricCard
          icon={CalendarIcon}
          tone="warning"
          label="Bekleyen"
          value={report.pendingTrades?.toLocaleString() ?? 0}
        />
        <MetricCard
          icon={CurrencyDollarIcon}
          tone="primary"
          label="Ort. Değer"
          value={`₺${report.averageTradeValue?.toFixed(2) ?? 0}`}
        />
      </div>

      <SectionCard title="Takas İstatistikleri">
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <div className="rounded-lg border border-success-700 bg-success-900/20 p-4 text-center">
            <p className="text-2xl font-bold text-success-700">
              {report.completedTrades || 0}
            </p>
            <p className="text-sm text-muted">Tamamlanan</p>
          </div>
          <div className="rounded-lg border border-warning-700 bg-warning-900/20 p-4 text-center">
            <p className="text-2xl font-bold text-warning-700">
              {report.pendingTrades || 0}
            </p>
            <p className="text-sm text-muted">Bekleyen</p>
          </div>
          <div className="rounded-lg border border-danger-700 bg-danger-900/20 p-4 text-center">
            <p className="text-2xl font-bold text-danger-600">
              {report.disputedTrades || 0}
            </p>
            <p className="text-sm text-muted">Anlaşmazlık</p>
          </div>
          <div className="rounded-lg border border-info-700 bg-info-900/20 p-4 text-center">
            <p className="text-2xl font-bold text-info-700">{successRate}%</p>
            <p className="text-sm text-muted">Başarı Oranı</p>
          </div>
        </div>
      </SectionCard>
    </div>
  );
}
