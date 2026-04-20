'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import { adminApi } from '@/lib/api';
import { StatusBadge, tradeStatusConfig, Spinner } from '@tarodan/ui';
import type { StatusConfig } from '@tarodan/ui';
import { MagnifyingGlassIcon, EyeIcon, ExclamationTriangleIcon, UserIcon, XCircleIcon } from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';

interface Trade {
  id: string;
  tradeNumber: string;
  status: string;
  initiator: { id: string; displayName: string };
  receiver: { id: string; displayName: string };
  initiatorItemsCount: number;
  receiverItemsCount: number;
  cashAmount?: number;
  hasDispute: boolean;
  createdAt: string;
}

interface User {
  id: string;
  displayName: string;
  email: string;
}

const statusOptions = [
  { value: 'all', label: 'Tümü' },
  { value: 'pending', label: 'Bekliyor' },
  { value: 'accepted', label: 'Kabul Edildi' },
  { value: 'awaiting_payment', label: 'Ödeme Bekleniyor' },
  { value: 'shipping_to_warehouse', label: 'Depoya Gönderim' },
  { value: 'at_warehouse', label: 'Tarodan Deposunda (İnceleme)' },
  { value: 'admin_reviewing', label: 'İnceleniyor' },
  { value: 'shipping_to_recipients', label: 'Alıcılara Gönderim' },
  { value: 'returning', label: 'İade Yolda' },
  { value: 'both_shipped', label: 'Gönderildi' },
  { value: 'completed', label: 'Tamamlandı' },
  { value: 'disputed', label: 'İtirazlı' },
  { value: 'cancelled', label: 'İptal' },
];

export default function TradesPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const urlUserId = useMemo(() => searchParams.get('userId') || '', [searchParams]);

  const [trades, setTrades] = useState<Trade[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('all');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [reviewQueueCount, setReviewQueueCount] = useState(0);

  // User filtering
  const [users, setUsers] = useState<User[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string>(urlUserId);
  const [userSearch, setUserSearch] = useState('');
  const [showUserDropdown, setShowUserDropdown] = useState(false);
  const [loadingUsers, setLoadingUsers] = useState(false);

  // Load users for dropdown
  const loadUsers = useCallback(async (searchTerm: string) => {
    if (!searchTerm || searchTerm.length < 2) {
      setUsers([]);
      return;
    }
    setLoadingUsers(true);
    try {
      const response = await adminApi.getUsers({ search: searchTerm, limit: 10 });
      const data = response.data.data || response.data.users || [];
      setUsers(data.map((u: any) => ({ id: u.id, displayName: u.displayName, email: u.email })));
    } catch (error) {
      if (process.env.NODE_ENV === 'development') console.error('Load users error:', error);
    } finally {
      setLoadingUsers(false);
    }
  }, []);

  // Debounce user search
  useEffect(() => {
    const timer = setTimeout(() => {
      if (userSearch) loadUsers(userSearch);
    }, 300);
    return () => clearTimeout(timer);
  }, [userSearch, loadUsers]);

  // Sync URL userId with state
  useEffect(() => {
    setSelectedUserId(urlUserId);
  }, [urlUserId]);

  const handleSelectUser = (user: User) => {
    setSelectedUserId(user.id);
    setUserSearch(user.displayName);
    setShowUserDropdown(false);
    router.push(`/trades?userId=${user.id}`);
  };

  const clearUserFilter = () => {
    setSelectedUserId('');
    setUserSearch('');
    router.push('/trades');
  };

  useEffect(() => {
    loadTrades();
  }, [page, status, selectedUserId]);

  // Load the admin-review queue count (at_warehouse) regardless of current filter
  useEffect(() => {
    const loadReviewQueueCount = async () => {
      try {
        const response = await adminApi.getTrades({ page: 1, limit: 1, status: 'at_warehouse' });
        const meta = response.data.meta || {};
        const data = response.data.data || response.data.trades || [];
        setReviewQueueCount(meta.total ?? data.length ?? 0);
      } catch (error) {
        if (process.env.NODE_ENV === 'development') console.error('Review queue count error:', error);
      }
    };
    loadReviewQueueCount();
  }, [status]);

  const loadTrades = async () => {
    setLoading(true);
    try {
      const response = await adminApi.getTrades({
        page,
        limit: 20,
        status: status === 'all' ? undefined : status,
        userId: selectedUserId || undefined,
      });
      const data = response.data.data || response.data.trades || [];
      const meta = response.data.meta || {};
      setTrades(data.map((t: any) => ({
        id: t.id,
        tradeNumber: t.tradeNumber || `TRD-${t.id.slice(0, 8)}`,
        status: t.status,
        initiator: t.initiator || { id: '', displayName: 'Başlatan' },
        receiver: t.receiver || { id: '', displayName: 'Alıcı' },
        initiatorItemsCount: t.initiatorItems?.length || 0,
        receiverItemsCount: t.receiverItems?.length || 0,
        cashAmount: Number(t.cashAmount || 0),
        hasDispute: !!t.dispute,
        createdAt: t.createdAt,
      })));
      setTotal(meta.total || data.length);
    } catch (error) {
      if (process.env.NODE_ENV === 'development') console.error('Trades load error:', error);
      toast.error('Takaslar yüklenemedi');
    } finally {
      setLoading(false);
    }
  };

  // Local dispute config entry
  const disputeConfig: Record<string, StatusConfig> = {
    disputed_override: { label: 'İtirazlı', variant: 'destructive' },
  };

  const disputedCount = trades.filter((t) => t.hasDispute).length;

  return (
    <>
      <div className="space-y-6">
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Takaslar</h1>
            <p className="text-gray-500 mt-1">
              Toplam {total} takas
              {selectedUserId && (
                <span className="ml-2">
                  — Kullanıcıya göre filtreleniyor
                  <button onClick={clearUserFilter} className="ml-2 text-primary-600 hover:underline">Filtreyi kaldır</button>
                </span>
              )}
            </p>
          </div>
          <div className="flex flex-col gap-2 items-end">
            {reviewQueueCount > 0 && (
              <button
                onClick={() => { setStatus('at_warehouse'); setPage(1); }}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg border font-medium transition-colors ${
                  status === 'at_warehouse'
                    ? 'bg-amber-500 text-white border-amber-600'
                    : 'bg-amber-100 text-amber-900 border-amber-400 hover:bg-amber-200'
                }`}
                title="İnceleme kuyruğunu filtrele"
              >
                <ExclamationTriangleIcon className="h-5 w-5" />
                <span>{reviewQueueCount} takas inceleme bekliyor</span>
              </button>
            )}
            {disputedCount > 0 && (
              <div className="flex items-center gap-2 px-4 py-2 bg-red-900/20 border border-red-700 rounded-lg">
                <ExclamationTriangleIcon className="h-5 w-5 text-red-600" />
                <span className="text-red-600">{disputedCount} itirazlı takas</span>
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-4">
          {/* User Filter */}
          <div className="relative w-full sm:w-64">
            <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-500" />
            <input
              type="text"
              placeholder="Kullanıcı ara..."
              value={userSearch}
              onChange={(e) => {
                setUserSearch(e.target.value);
                setShowUserDropdown(true);
              }}
              onFocus={() => setShowUserDropdown(true)}
              className="admin-input pl-10 pr-10"
            />
            {selectedUserId && (
              <button
                onClick={clearUserFilter}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-900"
              >
                <XCircleIcon className="h-5 w-5" />
              </button>
            )}
            
            {showUserDropdown && userSearch.length >= 2 && (
              <div className="absolute z-50 w-full mt-1 bg-gray-100 border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                {loadingUsers ? (
                  <div className="p-3 text-center text-gray-500">Aranıyor...</div>
                ) : users.length > 0 ? (
                  users.map((user) => (
                    <button
                      key={user.id}
                      onClick={() => handleSelectUser(user)}
                      className="w-full px-4 py-2 text-left hover:bg-gray-100 text-gray-900"
                    >
                      <div className="font-medium">{user.displayName}</div>
                      <div className="text-xs text-gray-500">{user.email}</div>
                    </button>
                  ))
                ) : (
                  <div className="p-3 text-center text-gray-500">Kullanıcı bulunamadı</div>
                )}
              </div>
            )}
          </div>
          
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="admin-input w-full sm:w-48"
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
                      <Spinner size="lg" className="mx-auto" />
                    </td>
                  </tr>
                ) : trades.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="text-center py-8 text-gray-500">
                      Takas bulunamadı
                    </td>
                  </tr>
                ) : (
                  trades.map((trade) => (
                    <tr key={trade.id} className={trade.hasDispute ? 'bg-red-900/10' : ''}>
                      <td className="font-mono text-sm">{trade.tradeNumber}</td>
                      <td>{trade.hasDispute ? (
                        <StatusBadge status="disputed_override" config={disputeConfig} label="⚠️ İtirazlı" />
                      ) : (
                        <StatusBadge status={trade.status} config={tradeStatusConfig} />
                      )}</td>
                      <td>
                        <Link
                          href={`/users/${trade.initiator.id}`}
                          className="text-gray-900 hover:text-primary-600"
                        >
                          {trade.initiator.displayName}
                        </Link>
                      </td>
                      <td>
                        <Link
                          href={`/users/${trade.receiver.id}`}
                          className="text-gray-900 hover:text-primary-600"
                        >
                          {trade.receiver.displayName}
                        </Link>
                      </td>
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
                      <td className="whitespace-nowrap">{new Date(trade.createdAt).toLocaleDateString('tr-TR')}</td>
                      <td className="whitespace-nowrap">
                        <div className="flex gap-1">
                          <Link
                            href={`/trades/${trade.id}`}
                            className="p-2 text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-lg"
                            title="Detay"
                          >
                            <EyeIcon className="h-5 w-5" />
                          </Link>
                          {trade.hasDispute && (
                            <button
                              className="p-2 text-red-600 hover:bg-red-500/10 rounded-lg"
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
          <p className="text-sm text-gray-500">Sayfa {page} / {Math.ceil(total / 20)}</p>
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
    </>
  );
}
