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
import { Button, Input, Select, enumLabel, paymentHoldStatusConfig } from '@tarodan/ui';
import { AdminTabs } from '@/components/AdminTabs';
import { DataTable, type ColumnDef } from '@/components/DataTable';

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
  held: { label: 'Beklemede', color: 'text-warning-600' },
  released: { label: 'Ödendi', color: 'text-success-600' },
  cancelled: { label: 'İptal', color: 'text-muted' },
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

  const transactionColumns: ColumnDef<PayoutTransaction, any>[] = [
    {
      header: 'Sipariş',
      cell: ({ row }) => <span className="text-sm">{row.original.orderNumber}</span>,
    },
    {
      header: 'Satıcı',
      cell: ({ row }) => (
        <div className="text-sm">
          <div>{row.original.sellerName}</div>
          <div className="text-xs text-muted">{row.original.sellerEmail}</div>
        </div>
      ),
    },
    {
      id: 'amount',
      header: () => <span className="text-right">Tutar</span>,
      cell: ({ row }) => (
        <span className="text-sm text-right font-medium">{formatCurrency(row.original.amount)}</span>
      ),
    },
    {
      header: 'Durum',
      cell: ({ row }) => (
        <span className={STATUS_LABELS[row.original.status]?.color ?? 'text-muted'}>
          {enumLabel(paymentHoldStatusConfig, row.original.status)}
        </span>
      ),
    },
    {
      header: 'Serbest Bırakma',
      cell: ({ row }) => (
        <span className="text-sm whitespace-nowrap">
          {row.original.releasedAt
            ? formatDate(row.original.releasedAt)
            : row.original.releaseAt
              ? formatDate(row.original.releaseAt)
              : '-'}
        </span>
      ),
    },
    {
      id: 'actions',
      header: 'İşlem',
      cell: ({ row }) => (
        <div className="whitespace-nowrap">
          {row.original.status === 'held' && (
            <Button variant="secondary" type="button"
              onClick={() => handleRelease(row.original.orderId)}
              disabled={releasingOrderId === row.original.orderId}
              className="inline-flex items-center gap-1 text-sm text-primary-600 hover:text-primary-400 disabled:opacity-50">
              <CheckCircleIcon className="h-4 w-4" />
              {releasingOrderId === row.original.orderId ? 'Bırakılıyor...' : 'Serbest Bırak'}
            </Button>
          )}
        </div>
      ),
    },
  ];

  const scheduleColumns: ColumnDef<ScheduleItem, any>[] = [
    {
      header: 'Sipariş',
      cell: ({ row }) => <span className="text-sm">{row.original.orderNumber}</span>,
    },
    {
      header: 'Satıcı',
      cell: ({ row }) => <span className="text-sm">{row.original.sellerName}</span>,
    },
    {
      id: 'amount',
      header: () => <span className="text-right">Tutar</span>,
      cell: ({ row }) => (
        <span className="text-sm text-right font-medium">{formatCurrency(row.original.amount)}</span>
      ),
    },
    {
      header: 'Serbest Bırakma Tarihi',
      cell: ({ row }) => (
        <span className="text-sm whitespace-nowrap">{formatDate(row.original.releaseAt)}</span>
      ),
    },
  ];

  return (
    <>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <h1 className="text-2xl font-bold text-heading">Satıcı Ödemeleri</h1>
          <Button variant="secondary" type="button"
            onClick={handleExport}
            disabled={loadingExport}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-surface-alt text-heading hover:bg-surface-alt disabled:opacity-50">
            <ArrowDownTrayIcon className="h-5 w-5" />
            {loadingExport ? 'Hazırlanıyor...' : 'Dışa Aktar (CSV)'}
          </Button>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-surface-elevated rounded-xl p-4 border border-border">
            <p className="text-sm text-muted">Bekleyen Toplam</p>
            <p className="text-2xl font-semibold text-warning-500">
              {summary != null ? formatCurrency(summary.totalPending) : '—'}
            </p>
            <p className="text-xs text-muted mt-1">{summary?.countHeld ?? 0} işlem</p>
          </div>
          <div className="bg-surface-elevated rounded-xl p-4 border border-border">
            <p className="text-sm text-muted">Ödenen Toplam</p>
            <p className="text-2xl font-semibold text-success-500">
              {summary != null ? formatCurrency(summary.totalReleased) : '—'}
            </p>
            <p className="text-xs text-muted mt-1">{summary?.countReleased ?? 0} işlem</p>
          </div>
          <div className="bg-surface-elevated rounded-xl p-4 border border-border md:col-span-2">
            <p className="text-sm text-muted">Yaklaşan Serbest Bırakmalar</p>
            <ul className="mt-2 space-y-1">
              {summary?.nextReleases?.length
                ? summary.nextReleases.slice(0, 3).map((r) => (
                    <li key={r.id} className="text-sm text-muted flex justify-between">
                      <span>Sipariş #{r.orderId.slice(0, 8)}...</span>
                      <span>{formatCurrency(r.amount)} — {formatDate(r.releaseAt)}</span>
                    </li>
                  ))
                : <li className="text-sm text-muted">Bekleyen yok</li>}
            </ul>
          </div>
        </div>

        {/* Tabs */}
        <AdminTabs
          tabs={[
            { key: 'transactions', label: 'İşlem Geçmişi', icon: ListBulletIcon },
            { key: 'schedule', label: 'Ödeme Takvimi', icon: CalendarDaysIcon },
          ]}
          value={activeTab}
          onChange={(k) => setActiveTab(k as TabId)}
        />

        {activeTab === 'transactions' && (
          <>
            <div className="flex flex-wrap gap-3 items-center">
              <Select
                value={filters.status}
                onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}
                className="w-auto"
                selectSize="sm"
              >
                <option value="">Tüm durumlar</option>
                <option value="held">Beklemede</option>
                <option value="released">Ödendi</option>
                <option value="cancelled">İptal</option>
              </Select>
              <Input type="date"
                value={filters.dateFrom}
                onChange={(e) => setFilters((f) => ({ ...f, dateFrom: e.target.value }))} />
              <Input type="date"
                value={filters.dateTo}
                onChange={(e) => setFilters((f) => ({ ...f, dateTo: e.target.value }))} />
              <Button variant="secondary" type="button"
                onClick={() => loadTransactions()}
                className="p-2 rounded-lg bg-surface-alt text-muted hover:text-heading">
                <ArrowPathIcon className="h-5 w-5" />
              </Button>
            </div>
            <DataTable
              columns={transactionColumns}
              data={transactions}
              loading={loading}
              emptyText="Kayıt yok"
              getRowId={(t) => t.id}
            />
            {pagination.totalPages > 1 && (
              <div className="px-4 py-3 flex items-center justify-between">
                <p className="text-sm text-muted">
                  Toplam {pagination.total} kayıt
                </p>
                <div className="flex gap-2">
                  <Button variant="secondary" type="button"
                    onClick={() => setPagination((p) => ({ ...p, page: p.page - 1 }))}
                    disabled={pagination.page <= 1}
                    className="px-3 py-1 rounded bg-surface-alt text-sm disabled:opacity-50">
                    Önceki
                  </Button>
                  <Button variant="secondary" type="button"
                    onClick={() => setPagination((p) => ({ ...p, page: p.page + 1 }))}
                    disabled={pagination.page >= pagination.totalPages}
                    className="px-3 py-1 rounded bg-surface-alt text-sm disabled:opacity-50">
                    Sonraki
                  </Button>
                </div>
              </div>
            )}
          </>
        )}

        {activeTab === 'schedule' && (
          <DataTable
            columns={scheduleColumns}
            data={schedule}
            loading={loading}
            emptyText="Yaklaşan ödeme yok"
            getRowId={(s) => s.id}
          />
        )}
      </div>
    </>
  );
}
