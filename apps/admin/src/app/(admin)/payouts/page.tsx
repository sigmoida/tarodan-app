'use client';

import { useState } from 'react';
import { adminApi } from '@/lib/api';
import {
  ArrowDownTrayIcon,
  CalendarDaysIcon,
  ListBulletIcon,
  CheckCircleIcon,
} from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import { Button, Input, Select, enumLabel, paymentHoldStatusConfig } from '@tarodan/ui';
import { useQuery } from '@tanstack/react-query';
import { type ColumnDef } from '@/components/DataTable';
import { ActionButtons, FilterToolbar, PageHeader } from '@/components/admin-list';
import { AdminTabs } from '@/components/AdminTabs';
import { DataTable } from '@/components/DataTable';
import { Pagination } from '@/components/Pagination';
import { useAdminResource } from '@/hooks/useAdminResource';

// ─── Tipler ────────────────────────────────────────────────────────────────

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

// ─── Yardımcı ──────────────────────────────────────────────────────────────

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

// ─── Sekmeler ──────────────────────────────────────────────────────────────

const TABS = [
  { key: 'transactions', label: 'İşlem Geçmişi', icon: ListBulletIcon },
  { key: 'schedule', label: 'Ödeme Takvimi', icon: CalendarDaysIcon },
];

// ─── Sayfa ─────────────────────────────────────────────────────────────────

export default function PayoutsPage() {
  const [activeTab, setActiveTab] = useState<TabId>('transactions');
  const [releasingOrderId, setReleasingOrderId] = useState<string | null>(null);
  const [loadingExport, setLoadingExport] = useState(false);

  // ── Özet kartları — ayrı query (sekme bağımsız, sayfa açılışında yüklenir) ──
  const { data: summary, refetch: refetchSummary } = useQuery<PayoutSummary>({
    queryKey: ['payouts-summary'],
    queryFn: async () => {
      const res = await adminApi.getPayoutsSummary();
      return res.data;
    },
  });

  // ── useAdminResource — tek çağrı; queryKey + fetcher activeTab'a göre branşlar ──
  const {
    rows,
    page,
    setPage,
    totalPages,
    search,
    setSearch,
    onSearchSubmit,
    filters,
    setFilter,
    isLoading,
    refetch,
  } = useAdminResource<PayoutTransaction | ScheduleItem>({
    queryKey: `payouts-${activeTab}`,
    fetcher: (params) => {
      if (activeTab === 'transactions') {
        return adminApi.getPayoutsTransactions({
          search: params.search || undefined,
          page: params.page,
          limit: params.limit,
          status: params.status || undefined,
          dateFrom: params.dateFrom || undefined,
          dateTo: params.dateTo || undefined,
        });
      }
      // schedule
      return adminApi.getPayoutsSchedule({ limit: 50 });
    },
    limit: 20,
    initialFilters: activeTab === 'transactions' ? { status: '', dateFrom: '', dateTo: '' } : {},
    errorMessage:
      activeTab === 'transactions'
        ? 'İşlem geçmişi yüklenemedi'
        : 'Takvim yüklenemedi',
  });

  // ── Serbest bırakma aksiyonu ───────────────────────────────────────────────
  const handleRelease = async (orderId: string) => {
    setReleasingOrderId(orderId);
    try {
      await adminApi.releasePayout(orderId);
      toast.success('Ödeme satıcıya serbest bırakıldı');
      refetchSummary();
      refetch();
    } catch (e: any) {
      if (process.env.NODE_ENV === 'development') console.error(e);
      toast.error(e.response?.data?.message || 'Serbest bırakılamadı');
    } finally {
      setReleasingOrderId(null);
    }
  };

  // ── CSV dışa aktarım ──────────────────────────────────────────────────────
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

  // ── Kolon tanımları ────────────────────────────────────────────────────────

  const transactionColumns: ColumnDef<PayoutTransaction, any>[] = [
    {
      header: 'Sipariş',
      cell: ({ row }) => (
        <span className="text-sm">
          {(row.original as PayoutTransaction).orderNumber}
        </span>
      ),
    },
    {
      header: 'Satıcı',
      cell: ({ row }) => (
        <div className="text-sm">
          <div>{(row.original as PayoutTransaction).sellerName}</div>
          <div className="text-xs text-muted">
            {(row.original as PayoutTransaction).sellerEmail}
          </div>
        </div>
      ),
    },
    {
      id: 'amount',
      header: () => <span className="text-right">Tutar</span>,
      cell: ({ row }) => (
        <span className="text-sm text-right font-medium">
          {formatCurrency((row.original as PayoutTransaction).amount)}
        </span>
      ),
    },
    {
      header: 'Durum',
      cell: ({ row }) => {
        const status = (row.original as PayoutTransaction).status;
        return (
          <span className={STATUS_LABELS[status]?.color ?? 'text-muted'}>
            {enumLabel(paymentHoldStatusConfig, status)}
          </span>
        );
      },
    },
    {
      header: 'Serbest Bırakma',
      cell: ({ row }) => {
        const t = row.original as PayoutTransaction;
        return (
          <span className="text-sm whitespace-nowrap">
            {t.releasedAt
              ? formatDate(t.releasedAt)
              : t.releaseAt
                ? formatDate(t.releaseAt)
                : '-'}
          </span>
        );
      },
    },
    {
      id: 'actions',
      header: 'İşlem',
      cell: ({ row }) => {
        const t = row.original as PayoutTransaction;
        return (
          <ActionButtons>
            {t.status === 'held' && (
              <Button
                variant="secondary"
                type="button"
                onClick={() => handleRelease(t.orderId)}
                disabled={releasingOrderId === t.orderId}
                className="inline-flex items-center gap-1 text-sm text-primary-600 hover:text-primary-400 disabled:opacity-50"
              >
                <CheckCircleIcon className="h-4 w-4" />
                {releasingOrderId === t.orderId ? 'Bırakılıyor...' : 'Serbest Bırak'}
              </Button>
            )}
          </ActionButtons>
        );
      },
    },
  ];

  const scheduleColumns: ColumnDef<ScheduleItem, any>[] = [
    {
      header: 'Sipariş',
      cell: ({ row }) => (
        <span className="text-sm">
          {(row.original as ScheduleItem).orderNumber}
        </span>
      ),
    },
    {
      header: 'Satıcı',
      cell: ({ row }) => (
        <span className="text-sm">
          {(row.original as ScheduleItem).sellerName}
        </span>
      ),
    },
    {
      id: 'amount',
      header: () => <span className="text-right">Tutar</span>,
      cell: ({ row }) => (
        <span className="text-sm text-right font-medium">
          {formatCurrency((row.original as ScheduleItem).amount)}
        </span>
      ),
    },
    {
      header: 'Serbest Bırakma Tarihi',
      cell: ({ row }) => (
        <span className="text-sm whitespace-nowrap">
          {formatDate((row.original as ScheduleItem).releaseAt)}
        </span>
      ),
    },
  ];

  // ── Aktif sekme: tablo prop'ları ──────────────────────────────────────────
  const activeColumns =
    activeTab === 'transactions'
      ? (transactionColumns as ColumnDef<any, any>[])
      : (scheduleColumns as ColumnDef<any, any>[]);

  const activeEmptyText =
    activeTab === 'transactions' ? 'Kayıt yok' : 'Yaklaşan ödeme yok';

  // ── Render ─────────────────────────────────────────────────────────────────
  // Özet kartları liste olmadığından ResourceListPage dışında tutulur.
  // Sayfa düzeni: PageHeader → Özet Kartları → AdminTabs → Filtreler → DataTable → Pagination.
  // Bu, orijinal sayfa düzeniyle birebir aynı.
  return (
    <div className="space-y-6">
      {/* Başlık + Export butonu */}
      <PageHeader title="Satıcı Ödemeleri">
        <Button
          variant="secondary"
          type="button"
          onClick={handleExport}
          disabled={loadingExport}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-surface-alt text-heading hover:bg-surface-alt disabled:opacity-50"
        >
          <ArrowDownTrayIcon className="h-5 w-5" />
          {loadingExport ? 'Hazırlanıyor...' : 'Dışa Aktar (CSV)'}
        </Button>
      </PageHeader>

      {/* Özet kartları — liste olmadığından çatı dışında korunur */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-surface-elevated rounded-xl p-4 border border-border min-w-0">
          <p className="text-sm text-muted truncate">Bekleyen Toplam</p>
          <p className="text-2xl font-semibold text-warning-500 truncate">
            {summary != null ? formatCurrency(summary.totalPending) : '—'}
          </p>
          <p className="text-xs text-muted mt-1 truncate">
            {summary?.countHeld ?? 0} işlem
          </p>
        </div>
        <div className="bg-surface-elevated rounded-xl p-4 border border-border min-w-0">
          <p className="text-sm text-muted truncate">Ödenen Toplam</p>
          <p className="text-2xl font-semibold text-success-500 truncate">
            {summary != null ? formatCurrency(summary.totalReleased) : '—'}
          </p>
          <p className="text-xs text-muted mt-1 truncate">
            {summary?.countReleased ?? 0} işlem
          </p>
        </div>
        <div className="bg-surface-elevated rounded-xl p-4 border border-border md:col-span-2">
          <p className="text-sm text-muted">Yaklaşan Serbest Bırakmalar</p>
          <ul className="mt-2 space-y-1">
            {summary?.nextReleases?.length ? (
              summary.nextReleases.slice(0, 3).map((r) => (
                <li
                  key={r.id}
                  className="text-sm text-muted flex justify-between gap-2 min-w-0"
                >
                  <span className="truncate">
                    Sipariş #{r.orderId.slice(0, 8)}...
                  </span>
                  <span className="shrink-0 whitespace-nowrap">
                    {formatCurrency(r.amount)} — {formatDate(r.releaseAt)}
                  </span>
                </li>
              ))
            ) : (
              <li className="text-sm text-muted">Bekleyen yok</li>
            )}
          </ul>
        </div>
      </div>

      {/* Sekmeler */}
      <AdminTabs
        tabs={TABS}
        value={activeTab}
        onChange={(k) => setActiveTab(k as TabId)}
      />

      {/* Transactions sekmesinde filtreler */}
      {activeTab === 'transactions' && (
        <FilterToolbar
          search={search}
          onSearchChange={setSearch}
          onSearchSubmit={onSearchSubmit}
          searchPlaceholder="Satıcı adı, e-posta veya sipariş no..."
        >
          <Select
            value={filters.status ?? ''}
            onChange={(e) => setFilter('status', e.target.value)}
            className="sm:w-44"
          >
            <option value="">Tüm durumlar</option>
            <option value="held">Tutuluyor</option>
            <option value="released">Serbest Bırakıldı</option>
            <option value="cancelled">İptal Edildi</option>
          </Select>
          <Input
            type="date"
            value={filters.dateFrom ?? ''}
            onChange={(e) => setFilter('dateFrom', e.target.value)}
            className="sm:w-40"
          />
          <Input
            type="date"
            value={filters.dateTo ?? ''}
            onChange={(e) => setFilter('dateTo', e.target.value)}
            className="sm:w-40"
          />
        </FilterToolbar>
      )}

      {/* Liste */}
      <DataTable
        columns={activeColumns}
        data={rows}
        loading={isLoading}
        emptyText={activeEmptyText}
        getRowId={(r: any) => r.id}
      />

      {/* Sayfalama */}
      <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
    </div>
  );
}
