'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Button,
  Select,
  Input,
  Spinner,
  enumLabel,
  paymentStatusConfig,
  paymentProviderConfig,
} from '@tarodan/ui';
import {
  CurrencyDollarIcon,
  CreditCardIcon,
  CheckCircleIcon,
  ChartBarIcon,
} from '@heroicons/react/24/outline';
import { adminApi } from '@/lib/api';
import { AdminPage } from '@/components/page/AdminPage';
import { PageHeader } from '@/components/AdminList';
import { SectionCard } from '@/components/detail/SectionCard';
import { MetricCard } from '@/components/MetricCard';
import { fmtTry } from '@/lib/format';

interface PaymentStatistics {
  period: string;
  startDate: string;
  endDate: string;
  summary: {
    totalPayments: number;
    completedPayments: number;
    failedPayments: number;
    pendingPayments: number;
    totalRevenue: number;
    averageAmount: number;
    successRate: number;
  };
  byProvider: Array<{ provider: string; count: number; totalAmount: number; percentage: number }>;
  byStatus: Array<{ status: string; count: number; percentage: number }>;
}

const PERIOD_OPTIONS = [
  { value: 'daily', label: 'Günlük' },
  { value: 'weekly', label: 'Haftalık' },
  { value: 'monthly', label: 'Aylık' },
];

function DistBar({ label, count, percentage }: { label: string; count: number; percentage: number }) {
  return (
    <div>
      <div className="mb-1 flex justify-between">
        <span className="text-sm font-medium text-body">{label}</span>
        <span className="text-sm text-muted">
          {count} ({percentage.toFixed(1)}%)
        </span>
      </div>
      <div className="h-2 w-full rounded-full bg-surface-alt">
        <div className="h-2 rounded-full bg-primary-500" style={{ width: `${percentage}%` }} />
      </div>
    </div>
  );
}

export default function PaymentStatisticsPage() {
  const [filters, setFilters] = useState<{
    period: 'daily' | 'weekly' | 'monthly';
    startDate: string;
    endDate: string;
  }>({ period: 'monthly', startDate: '', endDate: '' });

  const { data, isLoading } = useQuery({
    queryKey: ['payment-statistics', filters],
    queryFn: async () =>
      (
        await adminApi.getPaymentStatistics({
          period: filters.period,
          startDate: filters.startDate || undefined,
          endDate: filters.endDate || undefined,
        })
      ).data as PaymentStatistics,
  });

  const s = data?.summary;

  return (
    <AdminPage>
      <PageHeader
        title="Ödeme İstatistikleri"
        backHref="/finance/payments"
        description={
          data
            ? `${new Date(data.startDate).toLocaleDateString('tr-TR')} - ${new Date(
                data.endDate,
              ).toLocaleDateString('tr-TR')}`
            : undefined
        }
      />

      <SectionCard>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
          <Select
            label="Periyot"
            value={filters.period}
            onChange={(e) =>
              setFilters({ ...filters, period: e.target.value as typeof filters.period })
            }
            options={PERIOD_OPTIONS}
          />
          <Input
            type="date"
            label="Başlangıç Tarihi"
            value={filters.startDate}
            onChange={(e) => setFilters({ ...filters, startDate: e.target.value })}
          />
          <Input
            type="date"
            label="Bitiş Tarihi"
            value={filters.endDate}
            onChange={(e) => setFilters({ ...filters, endDate: e.target.value })}
          />
          <div className="flex items-end">
            <Button
              variant="secondary"
              className="w-full"
              onClick={() => setFilters({ period: 'monthly', startDate: '', endDate: '' })}
            >
              Sıfırla
            </Button>
          </div>
        </div>
      </SectionCard>

      {isLoading || !data || !s ? (
        <div className="flex h-64 items-center justify-center">
          <Spinner size="xl" />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
            <MetricCard
              icon={CurrencyDollarIcon}
              tone="success"
              label="Toplam Gelir"
              value={fmtTry(s.totalRevenue)}
            />
            <MetricCard
              icon={CreditCardIcon}
              tone="info"
              label="Toplam Ödeme"
              value={s.totalPayments}
            />
            <MetricCard
              icon={CheckCircleIcon}
              tone="success"
              label="Başarı Oranı"
              value={`${s.successRate.toFixed(1)}%`}
            />
            <MetricCard
              icon={ChartBarIcon}
              tone="primary"
              label="Ortalama Tutar"
              value={fmtTry(s.averageAmount)}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <SectionCard title="Durum Dağılımı" bodyClassName="space-y-3">
              {data.byStatus.map((item) => (
                <DistBar
                  key={item.status}
                  label={enumLabel(paymentStatusConfig, item.status)}
                  count={item.count}
                  percentage={item.percentage}
                />
              ))}
            </SectionCard>

            <SectionCard title="Sağlayıcı Dağılımı" bodyClassName="space-y-3">
              {data.byProvider.map((item) => (
                <div key={item.provider}>
                  <DistBar
                    label={enumLabel(paymentProviderConfig, item.provider)}
                    count={item.count}
                    percentage={item.percentage}
                  />
                  <p className="mt-1 text-xs text-muted">Toplam: {fmtTry(item.totalAmount)}</p>
                </div>
              ))}
            </SectionCard>
          </div>

          <SectionCard title="Detaylı Özet">
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              <div className="min-w-0 rounded-lg bg-success-50 p-4">
                <p className="mb-1 truncate text-sm text-muted">Tamamlanan</p>
                <p className="truncate text-2xl font-bold text-success-600">
                  {s.completedPayments}
                </p>
              </div>
              <div className="min-w-0 rounded-lg bg-danger-50 p-4">
                <p className="mb-1 truncate text-sm text-muted">Başarısız</p>
                <p className="truncate text-2xl font-bold text-danger-600">{s.failedPayments}</p>
              </div>
              <div className="min-w-0 rounded-lg bg-warning-50 p-4">
                <p className="mb-1 truncate text-sm text-muted">Bekleyen</p>
                <p className="truncate text-2xl font-bold text-warning-600">{s.pendingPayments}</p>
              </div>
              <div className="min-w-0 rounded-lg bg-info-50 p-4">
                <p className="mb-1 truncate text-sm text-muted">Toplam</p>
                <p className="truncate text-2xl font-bold text-info-600">{s.totalPayments}</p>
              </div>
            </div>
          </SectionCard>
        </>
      )}
    </AdminPage>
  );
}
