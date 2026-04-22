'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeftIcon,
  ChartBarIcon,
  CurrencyDollarIcon,
  CheckCircleIcon,
  XCircleIcon,
  CreditCardIcon,
} from '@heroicons/react/24/outline';
import { adminApi } from '@/lib/api';
import toast from 'react-hot-toast';
import { Button, Input, Select, Spinner } from '@tarodan/ui';

interface PaymentStatistics {
  period: string;
  startDate: Date;
  endDate: Date;
  summary: {
    totalPayments: number;
    completedPayments: number;
    failedPayments: number;
    pendingPayments: number;
    totalRevenue: number;
    averageAmount: number;
    successRate: number;
  };
  byProvider: Array<{
    provider: string;
    count: number;
    totalAmount: number;
    percentage: number;
  }>;
  byStatus: Array<{
    status: string;
    count: number;
    percentage: number;
  }>;
}

export default function AdminPaymentStatisticsPage() {
  const router = useRouter();
  const [statistics, setStatistics] = useState<PaymentStatistics | null>(null);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    period: 'monthly' as 'daily' | 'weekly' | 'monthly',
    startDate: '',
    endDate: '',
  });

  useEffect(() => {
    loadStatistics();
  }, [filters]);

  const loadStatistics = async () => {
    setLoading(true);
    try {
      const params: any = {};
      if (filters.period) params.period = filters.period;
      if (filters.startDate) params.startDate = filters.startDate;
      if (filters.endDate) params.endDate = filters.endDate;

      const response = await adminApi.getPaymentStatistics(params);
      setStatistics(response.data);
    } catch (error: any) {
      if (process.env.NODE_ENV === 'development') console.error('Statistics load error:', error);
      toast.error(error.response?.data?.message || 'İstatistikler yüklenemedi');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center">
        <Spinner size="xl" />
      </div>
    );
  }

  if (!statistics) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center">
        <p className="text-muted">İstatistikler yüklenemedi</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface">
      <main className="max-w-7xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <Link
            href="/payments"
            className="p-2 hover:bg-border-subtle rounded-lg transition-colors"
          >
            <ArrowLeftIcon className="w-6 h-6 text-muted" />
          </Link>
          <div className="flex-1">
            <h1 className="text-3xl font-bold text-heading">Ödeme İstatistikleri</h1>
            <p className="text-sm text-muted">
              {new Date(statistics.startDate).toLocaleDateString('tr-TR')} -{' '}
              {new Date(statistics.endDate).toLocaleDateString('tr-TR')}
            </p>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-surface-elevated rounded-xl shadow-sm p-6 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium text-body mb-2">Periyot</label>
              <Select
                value={filters.period}
                onChange={(e) => setFilters({ ...filters, period: e.target.value as any })}
              >
                <option value="daily">Günlük</option>
                <option value="weekly">Haftalık</option>
                <option value="monthly">Aylık</option>
              </Select>
            </div>
            <div>
              <label className="block text-sm font-medium text-body mb-2">Başlangıç Tarihi</label>
              <Input type="date"
                value={filters.startDate}
                onChange={(e) => setFilters({ ...filters, startDate: e.target.value })} />
            </div>
            <div>
              <label className="block text-sm font-medium text-body mb-2">Bitiş Tarihi</label>
              <Input type="date"
                value={filters.endDate}
                onChange={(e) => setFilters({ ...filters, endDate: e.target.value })} />
            </div>
            <div className="flex items-end">
              <Button variant="secondary" onClick={() => {
                  setFilters({ period: 'monthly', startDate: '', endDate: '' });
                }}
                className="w-full px-4 py-2 text-muted hover:text-body">
                Sıfırla
              </Button>
            </div>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
          <div className="bg-surface-elevated rounded-xl shadow-sm p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted mb-1">Toplam Gelir</p>
                <p className="text-2xl font-bold text-heading">
                  ₺{statistics.summary.totalRevenue.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                </p>
              </div>
              <CurrencyDollarIcon className="w-12 h-12 text-success-500" />
            </div>
          </div>

          <div className="bg-surface-elevated rounded-xl shadow-sm p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted mb-1">Toplam Ödeme</p>
                <p className="text-2xl font-bold text-heading">{statistics.summary.totalPayments}</p>
              </div>
              <CreditCardIcon className="w-12 h-12 text-info-500" />
            </div>
          </div>

          <div className="bg-surface-elevated rounded-xl shadow-sm p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted mb-1">Başarı Oranı</p>
                <p className="text-2xl font-bold text-heading">{statistics.summary.successRate.toFixed(1)}%</p>
              </div>
              <CheckCircleIcon className="w-12 h-12 text-success-500" />
            </div>
          </div>

          <div className="bg-surface-elevated rounded-xl shadow-sm p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted mb-1">Ortalama Tutar</p>
                <p className="text-2xl font-bold text-heading">
                  ₺{statistics.summary.averageAmount.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                </p>
              </div>
              <ChartBarIcon className="w-12 h-12 text-primary-500" />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* By Status */}
          <div className="bg-surface-elevated rounded-xl shadow-sm p-6">
            <h2 className="text-lg font-semibold text-heading mb-4">Durum Dağılımı</h2>
            <div className="space-y-3">
              {statistics.byStatus.map((item) => (
                <div key={item.status}>
                  <div className="flex justify-between mb-1">
                    <span className="text-sm font-medium text-body">{item.status}</span>
                    <span className="text-sm text-muted">
                      {item.count} ({item.percentage.toFixed(1)}%)
                    </span>
                  </div>
                  <div className="w-full bg-border-subtle rounded-full h-2">
                    <div
                      className="bg-primary-500 h-2 rounded-full"
                      style={{ width: `${item.percentage}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* By Provider */}
          <div className="bg-surface-elevated rounded-xl shadow-sm p-6">
            <h2 className="text-lg font-semibold text-heading mb-4">Sağlayıcı Dağılımı</h2>
            <div className="space-y-3">
              {statistics.byProvider.map((item) => (
                <div key={item.provider}>
                  <div className="flex justify-between mb-1">
                    <span className="text-sm font-medium text-body uppercase">{item.provider}</span>
                    <span className="text-sm text-muted">
                      {item.count} ({item.percentage.toFixed(1)}%)
                    </span>
                  </div>
                  <div className="flex justify-between text-xs text-muted mb-1">
                    <span>Toplam: ₺{item.totalAmount.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</span>
                  </div>
                  <div className="w-full bg-border-subtle rounded-full h-2">
                    <div
                      className="bg-primary-500 h-2 rounded-full"
                      style={{ width: `${item.percentage}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Detailed Breakdown */}
        <div className="bg-surface-elevated rounded-xl shadow-sm p-6 mt-6">
          <h2 className="text-lg font-semibold text-heading mb-4">Detaylı Özet</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="p-4 bg-success-50 rounded-lg">
              <p className="text-sm text-muted mb-1">Tamamlanan</p>
              <p className="text-2xl font-bold text-success-600">{statistics.summary.completedPayments}</p>
            </div>
            <div className="p-4 bg-danger-50 rounded-lg">
              <p className="text-sm text-muted mb-1">Başarısız</p>
              <p className="text-2xl font-bold text-danger-600">{statistics.summary.failedPayments}</p>
            </div>
            <div className="p-4 bg-warning-50 rounded-lg">
              <p className="text-sm text-muted mb-1">Bekleyen</p>
              <p className="text-2xl font-bold text-warning-600">{statistics.summary.pendingPayments}</p>
            </div>
            <div className="p-4 bg-info-50 rounded-lg">
              <p className="text-sm text-muted mb-1">Toplam</p>
              <p className="text-2xl font-bold text-info-600">{statistics.summary.totalPayments}</p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
