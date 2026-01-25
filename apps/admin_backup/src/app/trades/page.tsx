'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import AdminLayout from '@/components/AdminLayout';
import { MagnifyingGlassIcon, EyeIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';

interface Trade {
  id: string;
  tradeNumber: string;
  status: string;
  initiator: { displayName: string };
  receiver: { displayName: string };
  initiatorItemsCount: number;
  receiverItemsCount: number;
  cashAmount?: number;
  hasDispute: boolean;
  createdAt: string;
}

const statusOptions = [
  { value: 'all', label: 'Tümü' },
  { value: 'pending', label: 'Bekliyor' },
  { value: 'accepted', label: 'Kabul Edildi' },
  { value: 'both_shipped', label: 'Gönderildi' },
  { value: 'completed', label: 'Tamamlandı' },
  { value: 'disputed', label: 'İtirazlı' },
  { value: 'cancelled', label: 'İptal' },
];

export default function TradesPage() {
  const [trades, setTrades] = useState<Trade[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('all');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    loadTrades();
  }, [page, status]);

  const loadTrades = async () => {
    setLoading(true);
    try {
      const response = await adminApi.getTrades({
        page,
        limit: 20,
        status: status === 'all' ? undefined : status,
      });
      const data = response.data.data || response.data.trades || [];
      const meta = response.data.meta || {};
      setTrades(data.map((t: any) => ({
        id: t.id,
        tradeNumber: t.tradeNumber || `TRD-${t.id.slice(0, 8)}`,
        status: t.status,
        initiator: t.initiator || { displayName: 'Başlatan' },
        receiver: t.receiver || { displayName: 'Alıcı' },
        initiatorItemsCount: t.initiatorItems?.length || 0,
        receiverItemsCount: t.receiverItems?.length || 0,
        cashAmount: Number(t.cashAmount || 0),
        hasDispute: !!t.dispute,
        createdAt: t.createdAt,
      })));
      setTotal(meta.total || data.length);
    } catch (error) {
      console.error('Trades load error:', error);
      toast.error('Takaslar yüklenemedi');
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (status: string, hasDispute: boolean) => {
    if (hasDispute) {
      return <span className="badge badge-danger">⚠️ İtirazlı</span>;
    }
    const colors: Record<string, string> = {
      pending: 'badge-warning',
      accepted: 'badge-info',
      initiator_shipped: 'badge-info',
      receiver_shipped: 'badge-info',
      both_shipped: 'badge-info',
      completed: 'badge-success',
      cancelled: 'badge-danger',
      rejected: 'badge-gray',
    };
    const labels: Record<string, string> = {
      pending: 'Bekliyor',
      accepted: 'Kabul',
      initiator_shipped: 'Kısmen Gönderildi',
      receiver_shipped: 'Kısmen Gönderildi',
      both_shipped: 'Gönderildi',
      completed: 'Tamamlandı',
      cancelled: 'İptal',
      rejected: 'Reddedildi',
    };
    return <span className={`badge ${colors[status]}`}>{labels[status]}</span>;
  };

  const disputedCount = trades.filter((t) => t.hasDispute).length;

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-2xl font-bold text-white">Takaslar</h1>
            <p className="text-gray-400 mt-1">Toplam {total} takas</p>
          </div>
          {disputedCount > 0 && (
            <div className="flex items-center gap-2 px-4 py-2 bg-red-900/20 border border-red-700 rounded-lg">
              <ExclamationTriangleIcon className="h-5 w-5 text-red-400" />
              <span className="text-red-400">{disputedCount} itirazlı takas</span>
            </div>
          )}
        </div>

        <div className="flex gap-4">
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="admin-input w-48"
          >
            {statusOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        <div className="admin-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Takas No</th>
                  <th>Durum</th>
                  <th>Başlatan</th>
                  <th>Alan</th>
                  <th>Ürünler</th>
                  <th>Nakit</th>
                  <th>Tarih</th>
                  <th>İşlemler</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={8} className="text-center py-8">
                      <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary-500 mx-auto"></div>
                    </td>
                  </tr>
                ) : trades.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="text-center py-8 text-gray-400">
                      Takas bulunamadı
                    </td>
                  </tr>
                ) : (
                  trades.map((trade) => (
                    <tr key={trade.id} className={trade.hasDispute ? 'bg-red-900/10' : ''}>
                      <td className="font-mono text-sm">{trade.tradeNumber}</td>
                      <td>{getStatusBadge(trade.status, trade.hasDispute)}</td>
                      <td>{trade.initiator.displayName}</td>
                      <td>{trade.receiver.displayName}</td>
                      <td>
                        {trade.initiatorItemsCount} ↔️ {trade.receiverItemsCount}
                      </td>
                      <td>
                        {trade.cashAmount ? (
                          <span className="text-primary-400">
                            +₺{trade.cashAmount.toLocaleString()}
                          </span>
                        ) : (
                          <span className="text-gray-500">-</span>
                        )}
                      </td>
                      <td>{new Date(trade.createdAt).toLocaleDateString('tr-TR')}</td>
                      <td>
                        <div className="flex gap-1">
                          <Link
                            href={`/admin/trades/${trade.id}`}
                            className="p-2 text-gray-400 hover:text-white hover:bg-dark-700 rounded-lg"
                            title="Detay"
                          >
                            <EyeIcon className="h-5 w-5" />
                          </Link>
                          {trade.hasDispute && (
                            <button
                              className="p-2 text-red-400 hover:bg-red-500/10 rounded-lg"
                              title="İtirazı Çöz"
                            >
                              <ExclamationTriangleIcon className="h-5 w-5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-400">Sayfa {page} / {Math.ceil(total / 20)}</p>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="btn-secondary disabled:opacity-50"
            >
              Önceki
            </button>
            <button
              onClick={() => setPage((p) => p + 1)}
              disabled={page >= Math.ceil(total / 20)}
              className="btn-secondary disabled:opacity-50"
            >
              Sonraki
            </button>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
