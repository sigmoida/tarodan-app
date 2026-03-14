'use client';

import { useState, useEffect } from 'react';
import { adminApi } from '@/lib/api';
import {
  ArrowDownTrayIcon,
  CalendarDaysIcon,
  ListBulletIcon,
  ArrowPathIcon,
  CheckCircleIcon,
} from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';

type TabId = 'transactions' | 'schedule';

interface PayoutSummary {
  totalPending: number;
  totalReleased: number;
  countHeld: number;
  countReleased: number;
  nextReleases: Array<{
    id: string;
    orderId: string;
    amount: number;
    releaseAt: string | null;
    sellerId: string;
  }>;
}

interface PayoutTransaction {
  id: string;
  orderId: string;
  orderNumber: string;
  sellerId: string;
  sellerName: string;
  sellerEmail: string;
  amount: number;
  status: string;
  releaseAt: string | null;
  releasedAt: string | null;
  paidAt: string | null;
  createdAt: string;
}

interface ScheduleItem {
  id: string;
  orderId: string;
  orderNumber: string;
  sellerId: string;
  sellerName: string;
  amount: number;
  releaseAt: string | null;
  createdAt: string;
}

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  held: { label: 'Beklemede', color: 'text-amber-600' },
  released: { label: 'Ödendi', color: 'text-green-600' },
  cancelled: { label: 'İptal', color: 'text-gray-500' },
};

function formatCurrency(amount: number) {
  return new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(amount);
}

function formatDate(s: string | null) {
  if (!s) return '-';
  return new Date(s).toLocaleDateString('tr-TR', {
    dateStyle: 'short',
    timeZone: 'Europe/Istanbul',
  });
}

export default function PayoutsPage() {
  const [activeTab, setActiveTab] = useState<TabId>('transactions');
  const [summary, setSummary] = useState<PayoutSummary | null>(null);
  const [transactions, setTransactions] = useState<PayoutTransaction[]>([]);
  const [schedule, setSchedule] = useState<ScheduleItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingExport, setLoadingExport] = useState(false);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 0,
  });
  const [filters, setFilters] = useState({
    status: '',
    dateFrom: '',
    dateTo: '',
  });
  const [releasingOrderId, setReleasingOrderId] = useState<string | null>(null);

  useEffect(() => {
    loadSummary();
  }, []);

  useEffect(() => {
    if (activeTab === 'transactions') loadTransactions();
    else loadSchedule();
  }, [activeTab, pagination.page, filters]);

  const loadSummary = async () => {
    try {
      const res = await adminApi.getPayoutsSummary();
      setSummary(res.data);
    } catch (e) {
      if (process.env.NODE_ENV === 'development') console.error(e);
      toast.error('Özet yüklenemedi');
    } finally {
      setLoading(false);
    }
  };

  const loadTransactions = async () => {
    setLoading(true);
    try {
      const res = await adminApi.getPayoutsTransactions({
        page: pagination.page,
        limit: pagination.limit,
        status: filters.status || undefined,
        dateFrom: filters.dateFrom || undefined,
        dateTo: filters.dateTo || undefined,
      });
      setTransactions(res.data?.data || []);
      setPagination((p) => ({
        ...p,
        total: res.data?.meta?.total ?? 0,
        totalPages: res.data?.meta?.totalPages ?? 0,
      }));
    } catch (e) {
      if (process.env.NODE_ENV === 'development') console.error(e);
      toast.error('İşlem geçmişi yüklenemedi');
    } finally {
      setLoading(false);
    }
  };

  const loadSchedule = async () => {
    setLoading(true);
    try {
      const res = await adminApi.getPayoutsSchedule({ limit: 50 });
      setSchedule(res.data?.data || []);
    } catch (e) {
      if (process.env.NODE_ENV === 'development') console.error(e);
      toast.error('Takvim yüklenemedi');
    } finally {
      setLoading(false);
    }
  };

  const handleExport = async () => {
    setLoadingExport(true);
    try {
      const res = await adminApi.getPayoutsExport({
        status: filters.status || undefined,
        dateFrom: filters.dateFrom || undefined,
        dateTo: filters.dateTo || undefined,
      });
      const { csv, filename } = res.data;
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = filename;
      link.click();
      URL.revokeObjectURL(link.href);
      toast.success('Dışa aktarıldı');
    } catch (e) {
      if (process.env.NODE_ENV === 'development') console.error(e);
      toast.error('Dışa aktarma başarısız');
    } finally {
      setLoadingExport(false);
    }
  };

  const handleRelease = async (orderId: string) => {
    setReleasingOrderId(orderId);
    try {
      await adminApi.releasePayout(orderId);
      toast.success('Ödeme satıcıya serbest bırakıldı');
      loadSummary();
      loadTransactions();
      loadSchedule();
    } catch (e: any) {
      if (process.env.NODE_ENV === 'development') console.error(e);
      toast.error(e.response?.data?.message || 'Serbest bırakılamadı');
    } finally {
      setReleasingOrderId(null);
    }
  };

  return (
    <>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <h1 className="text-2xl font-bold text-gray-900">Satıcı Ödemeleri</h1>
          <button
            type="button"
            onClick={handleExport}
            disabled={loadingExport}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-gray-100 text-gray-900 hover:bg-gray-100 disabled:opacity-50"
          >
            <ArrowDownTrayIcon className="h-5 w-5" />
            {loadingExport ? 'Hazırlanıyor...' : 'Dışa Aktar (CSV)'}
          </button>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white rounded-xl p-4 border border-gray-200">
            <p className="text-sm text-gray-500">Bekleyen Toplam</p>
            <p className="text-2xl font-semibold text-amber-500">
              {summary != null ? formatCurrency(summary.totalPending) : '—'}
            </p>
            <p className="text-xs text-gray-500 mt-1">{summary?.countHeld ?? 0} işlem</p>
          </div>
          <div className="bg-white rounded-xl p-4 border border-gray-200">
            <p className="text-sm text-gray-500">Ödenen Toplam</p>
            <p className="text-2xl font-semibold text-green-500">
              {summary != null ? formatCurrency(summary.totalReleased) : '—'}
            </p>
            <p className="text-xs text-gray-500 mt-1">{summary?.countReleased ?? 0} işlem</p>
          </div>
          <div className="bg-white rounded-xl p-4 border border-gray-200 md:col-span-2">
            <p className="text-sm text-gray-500">Yaklaşan Serbest Bırakmalar</p>
            <ul className="mt-2 space-y-1">
              {summary?.nextReleases?.length
                ? summary.nextReleases.slice(0, 3).map((r) => (
                    <li key={r.id} className="text-sm text-gray-600 flex justify-between">
                      <span>Sipariş #{r.orderId.slice(0, 8)}...</span>
                      <span>{formatCurrency(r.amount)} — {formatDate(r.releaseAt)}</span>
                    </li>
                  ))
                : <li className="text-sm text-gray-500">Bekleyen yok</li>}
            </ul>
          </div>
        </div>

        {/* Tabs */}
        <div className="border-b border-gray-200">
          <nav className="flex gap-4">
            <button
              type="button"
              onClick={() => setActiveTab('transactions')}
              className={`pb-3 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'transactions'
                  ? 'border-primary-500 text-primary-600'
                  : 'border-transparent text-gray-500 hover:text-gray-900'
              }`}
            >
              <span className="flex items-center gap-2">
                <ListBulletIcon className="h-4 w-4" />
                İşlem Geçmişi
              </span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('schedule')}
              className={`pb-3 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'schedule'
                  ? 'border-primary-500 text-primary-600'
                  : 'border-transparent text-gray-500 hover:text-gray-900'
              }`}
            >
              <span className="flex items-center gap-2">
                <CalendarDaysIcon className="h-4 w-4" />
                Ödeme Takvimi
              </span>
            </button>
          </nav>
        </div>

        {activeTab === 'transactions' && (
          <>
            <div className="flex flex-wrap gap-3 items-center">
              <select
                value={filters.status}
                onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}
                className="input-dark rounded-lg px-3 py-2 text-sm"
              >
                <option value="">Tüm durumlar</option>
                <option value="held">Beklemede</option>
                <option value="released">Ödendi</option>
                <option value="cancelled">İptal</option>
              </select>
              <input
                type="date"
                value={filters.dateFrom}
                onChange={(e) => setFilters((f) => ({ ...f, dateFrom: e.target.value }))}
                className="input-dark rounded-lg px-3 py-2 text-sm"
              />
              <input
                type="date"
                value={filters.dateTo}
                onChange={(e) => setFilters((f) => ({ ...f, dateTo: e.target.value }))}
                className="input-dark rounded-lg px-3 py-2 text-sm"
              />
              <button
                type="button"
                onClick={() => loadTransactions()}
                className="p-2 rounded-lg bg-gray-100 text-gray-500 hover:text-gray-900"
              >
                <ArrowPathIcon className="h-5 w-5" />
              </button>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              {loading ? (
                <div className="p-8 text-center text-gray-500">Yükleniyor...</div>
              ) : transactions.length === 0 ? (
                <div className="p-8 text-center text-gray-500">Kayıt yok</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead>
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Sipariş</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Satıcı</th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Tutar</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Durum</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Serbest Bırakma</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">İşlem</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {transactions.map((t) => (
                        <tr key={t.id} className="text-gray-600">
                          <td className="px-4 py-3 text-sm">{t.orderNumber}</td>
                          <td className="px-4 py-3 text-sm">
                            <div>{t.sellerName}</div>
                            <div className="text-xs text-gray-500">{t.sellerEmail}</div>
                          </td>
                          <td className="px-4 py-3 text-sm text-right font-medium">{formatCurrency(t.amount)}</td>
                          <td className="px-4 py-3">
                            <span className={STATUS_LABELS[t.status]?.color ?? 'text-gray-500'}>
                              {STATUS_LABELS[t.status]?.label ?? t.status}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-sm whitespace-nowrap">
                            {t.releasedAt ? formatDate(t.releasedAt) : (t.releaseAt ? formatDate(t.releaseAt) : '-')}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            {t.status === 'held' && (
                              <button
                                type="button"
                                onClick={() => handleRelease(t.orderId)}
                                disabled={releasingOrderId === t.orderId}
                                className="inline-flex items-center gap-1 text-sm text-primary-600 hover:text-primary-400 disabled:opacity-50"
                              >
                                <CheckCircleIcon className="h-4 w-4" />
                                {releasingOrderId === t.orderId ? 'Bırakılıyor...' : 'Serbest Bırak'}
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {pagination.totalPages > 1 && (
                <div className="px-4 py-3 flex items-center justify-between border-t border-gray-200">
                  <p className="text-sm text-gray-500">
                    Toplam {pagination.total} kayıt
                  </p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setPagination((p) => ({ ...p, page: p.page - 1 }))}
                      disabled={pagination.page <= 1}
                      className="px-3 py-1 rounded bg-gray-100 text-sm disabled:opacity-50"
                    >
                      Önceki
                    </button>
                    <button
                      type="button"
                      onClick={() => setPagination((p) => ({ ...p, page: p.page + 1 }))}
                      disabled={pagination.page >= pagination.totalPages}
                      className="px-3 py-1 rounded bg-gray-100 text-sm disabled:opacity-50"
                    >
                      Sonraki
                    </button>
                  </div>
                </div>
              )}
            </div>
          </>
        )}

        {activeTab === 'schedule' && (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            {loading ? (
              <div className="p-8 text-center text-gray-500">Yükleniyor...</div>
            ) : schedule.length === 0 ? (
              <div className="p-8 text-center text-gray-500">Yaklaşan ödeme yok</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead>
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Sipariş</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Satıcı</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Tutar</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Serbest Bırakma Tarihi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {schedule.map((s) => (
                      <tr key={s.id} className="text-gray-600">
                        <td className="px-4 py-3 text-sm">{s.orderNumber}</td>
                        <td className="px-4 py-3 text-sm">{s.sellerName}</td>
                        <td className="px-4 py-3 text-sm text-right font-medium">{formatCurrency(s.amount)}</td>
                        <td className="px-4 py-3 text-sm whitespace-nowrap">{formatDate(s.releaseAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}
