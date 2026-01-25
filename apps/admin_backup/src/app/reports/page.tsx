'use client';

import { useState, useEffect } from 'react';
import AdminLayout from '@/components/AdminLayout';
import { adminApi } from '@/lib/api';
import { ChartBarIcon, DocumentArrowDownIcon } from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';

interface ReportSummary {
  type: string;
  label: string;
  count: number;
  revenue?: number;
  period: string;
}

export default function ReportsPage() {
  const [activeTab, setActiveTab] = useState<'sales' | 'users' | 'trades' | 'products'>('sales');
  const [dateRange, setDateRange] = useState<'today' | 'week' | 'month' | 'year' | 'all'>('month');
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState<ReportSummary | null>(null);

  useEffect(() => {
    loadReport();
  }, [activeTab, dateRange]);

  const loadReport = async () => {
    setLoading(true);
    try {
      let response;
      switch (activeTab) {
        case 'sales':
          response = await adminApi.getSalesReport({ dateRange });
          break;
        case 'users':
          response = await adminApi.getUserReport({ dateRange });
          break;
        case 'trades':
          response = await adminApi.getTradeReport({ dateRange });
          break;
        case 'products':
          response = await adminApi.getProductReport({ dateRange });
          break;
        default:
          return;
      }
      const data = response.data.data || response.data;
      setSummary({
        type: activeTab,
        label: activeTab === 'sales' ? 'Satış Raporu' : 
               activeTab === 'users' ? 'Kullanıcı Raporu' :
               activeTab === 'trades' ? 'Takas Raporu' : 'Ürün Raporu',
        count: data.count || data.total || 0,
        revenue: data.revenue || data.totalRevenue || 0,
        period: dateRange,
      });
    } catch (error) {
      console.error('Report load error:', error);
      toast.error('Rapor yüklenemedi');
    } finally {
      setLoading(false);
    }
  };

  const handleExport = async (format: 'excel' | 'pdf') => {
    try {
      const blob = await adminApi.exportReport(activeTab, format, { period: dateRange });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${activeTab}-report-${Date.now()}.${format === 'excel' ? 'xlsx' : 'pdf'}`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      toast.success('Rapor indirildi');
    } catch (error) {
      toast.error('Rapor indirilemedi');
    }
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-2xl font-bold text-white">Raporlar</h1>
            <p className="text-gray-400 mt-1">Platform istatistikleri ve analizler</p>
          </div>
          {summary && (
            <div className="flex gap-2">
              <button
                onClick={() => handleExport('excel')}
                className="btn-secondary flex items-center gap-2"
              >
                <DocumentArrowDownIcon className="h-5 w-5" />
                Excel
              </button>
              <button
                onClick={() => handleExport('pdf')}
                className="btn-secondary flex items-center gap-2"
              >
                <DocumentArrowDownIcon className="h-5 w-5" />
                PDF
              </button>
            </div>
          )}
        </div>

        {/* Tabs */}
        <div className="flex gap-2 border-b border-dark-700 pb-2">
          {[
            { id: 'sales', label: 'Satışlar' },
            { id: 'users', label: 'Kullanıcılar' },
            { id: 'trades', label: 'Takaslar' },
            { id: 'products', label: 'Ürünler' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`px-4 py-2 rounded-t-lg transition-colors ${
                activeTab === tab.id
                  ? 'bg-dark-700 text-white'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Date Range */}
        <div className="flex items-center gap-4">
          <span className="text-gray-400">Dönem:</span>
          <select
            value={dateRange}
            onChange={(e) => setDateRange(e.target.value as any)}
            className="admin-input w-48"
          >
            <option value="today">Bugün</option>
            <option value="week">Bu Hafta</option>
            <option value="month">Bu Ay</option>
            <option value="year">Bu Yıl</option>
            <option value="all">Tümü</option>
          </select>
        </div>

        {/* Summary Cards */}
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary-500"></div>
          </div>
        ) : summary ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="admin-card">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-400">{summary.label}</p>
                  <p className="text-3xl font-bold text-white mt-2">{summary.count.toLocaleString()}</p>
                </div>
                <div className="p-3 bg-primary-500/20 rounded-lg">
                  <ChartBarIcon className="h-8 w-8 text-primary-500" />
                </div>
              </div>
            </div>
            {summary.revenue && (
              <div className="admin-card">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-400">Toplam Gelir</p>
                    <p className="text-3xl font-bold text-green-400 mt-2">
                      ₺{summary.revenue.toLocaleString()}
                    </p>
                  </div>
                  <div className="p-3 bg-green-500/20 rounded-lg">
                    <span className="text-2xl">💰</span>
                  </div>
                </div>
              </div>
            )}
            <div className="admin-card">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-400">Dönem</p>
                  <p className="text-lg font-semibold text-white mt-2 capitalize">
                    {dateRange === 'today' ? 'Bugün' : dateRange === 'week' ? 'Bu Hafta' : dateRange === 'month' ? 'Bu Ay' : dateRange === 'year' ? 'Bu Yıl' : 'Tümü'}
                  </p>
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {/* Report Details Placeholder */}
        <div className="admin-card">
          <h2 className="text-lg font-semibold text-white mb-4">Detaylı Rapor</h2>
          <div className="text-center py-12 text-gray-400">
            <ChartBarIcon className="h-16 w-16 mx-auto mb-4 opacity-50" />
            <p>Detaylı rapor verileri burada gösterilecek</p>
            <p className="text-sm mt-2">Grafikler ve tablolar eklenecek</p>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
