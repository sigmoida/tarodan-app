'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import { adminApi } from '@/lib/api';
import { MagnifyingGlassIcon, EyeIcon, PencilIcon, CheckIcon, XMarkIcon, UserIcon, XCircleIcon } from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';

interface Order {
  id: string;
  orderNumber: string;
  status: string;
  totalAmount: number;
  commission: number;
  buyer: { id: string; displayName: string };
  seller: { id: string; displayName: string };
  product?: { id: string; title: string };
  createdAt: string;
  itemCount: number;
}

interface User {
  id: string;
  displayName: string;
  email: string;
}

const statusOptions = [
  { value: 'all', label: 'Tümü' },
  { value: 'pending_payment', label: 'Ödeme Bekliyor' },
  { value: 'paid', label: 'Ödendi' },
  { value: 'preparing', label: 'Hazırlanıyor' },
  { value: 'shipped', label: 'Kargoda' },
  { value: 'delivered', label: 'Teslim Edildi' },
  { value: 'completed', label: 'Tamamlandı' },
  { value: 'cancelled', label: 'İptal' },
];

export default function OrdersPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const urlUserId = useMemo(() => searchParams.get('userId') || '', [searchParams]);
  const productId = useMemo(() => searchParams.get('productId') || undefined, [searchParams]);

  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [editingOrderId, setEditingOrderId] = useState<string | null>(null);
  const [newStatus, setNewStatus] = useState<string>('');
  const [updatingStatus, setUpdatingStatus] = useState(false);

  // User filtering
  const [users, setUsers] = useState<User[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string>(urlUserId);
  const [userSearch, setUserSearch] = useState('');
  const [showUserDropdown, setShowUserDropdown] = useState(false);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Debounce order search (300ms)
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

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

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowUserDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Sync URL with state
  useEffect(() => {
    setSelectedUserId(urlUserId);
  }, [urlUserId]);

  const updateUrl = (userId: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (userId) params.set('userId', userId);
    else params.delete('userId');
    router.push(`/orders?${params.toString()}`);
  };

  const handleSelectUser = (user: User) => {
    setSelectedUserId(user.id);
    setUserSearch(user.displayName);
    setShowUserDropdown(false);
    updateUrl(user.id);
  };

  const clearUserFilter = () => {
    setSelectedUserId('');
    setUserSearch('');
    const params = new URLSearchParams(searchParams.toString());
    params.delete('userId');
    router.push(`/orders?${params.toString()}`);
  };

  useEffect(() => {
    loadOrders();
  }, [page, status, selectedUserId, productId, debouncedSearch]);

  const loadOrders = async () => {
    setLoading(true);
    try {
      const response = await adminApi.getOrders({
        page,
        limit: 20,
        status: status === 'all' ? undefined : status,
        search: debouncedSearch || undefined,
        userId: selectedUserId || undefined,
        productId,
      });
      const data = response.data.data || response.data.orders || [];
      const meta = response.data.meta || {};
      setOrders(data.map((o: any) => ({
        id: o.id,
        orderNumber: o.orderNumber || `ORD-${o.id.slice(0, 8)}`,
        status: o.status,
        totalAmount: Number(o.totalAmount || o.total || 0),
        commission: Number(o.commissionAmount || 0),
        buyer: o.buyer || { id: '', displayName: 'Alıcı' },
        seller: o.seller || { id: '', displayName: 'Satıcı' },
        product: o.product || undefined,
        createdAt: o.createdAt,
        itemCount: o.items?.length || 1,
      })));
      setTotal(meta.total || data.length);
    } catch (error) {
      if (process.env.NODE_ENV === 'development') console.error('Orders load error:', error);
      toast.error('Siparişler yüklenemedi');
    } finally {
      setLoading(false);
    }
  };

  const startEditing = (order: Order) => {
    setEditingOrderId(order.id);
    setNewStatus(order.status);
  };

  const cancelEditing = () => {
    setEditingOrderId(null);
    setNewStatus('');
  };

  const updateOrderStatus = async (orderId: string) => {
    if (!newStatus) return;
    
    setUpdatingStatus(true);
    try {
      await adminApi.updateOrderStatus(orderId, newStatus);
      toast.success('Sipariş durumu güncellendi');
      setEditingOrderId(null);
      loadOrders();
    } catch (error: any) {
      if (process.env.NODE_ENV === 'development') console.error('Status update error:', error);
      toast.error(error.response?.data?.message || 'Durum güncellenemedi');
    } finally {
      setUpdatingStatus(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const colors: Record<string, string> = {
      pending_payment: 'badge-warning',
      paid: 'badge-info',
      preparing: 'badge-info',
      shipped: 'badge-info',
      delivered: 'badge-success',
      completed: 'badge-success',
      cancelled: 'badge-danger',
    };
    const labels: Record<string, string> = {
      pending_payment: 'Ödeme Bekliyor',
      paid: 'Ödendi',
      preparing: 'Hazırlanıyor',
      shipped: 'Kargoda',
      delivered: 'Teslim Edildi',
      completed: 'Tamamlandı',
      cancelled: 'İptal',
    };
    return <span className={`badge ${colors[status] || 'badge-info'}`}>{labels[status] || status}</span>;
  };

  const totalPages = Math.max(1, Math.ceil(total / 20));

  return (
    <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Siparişler</h1>
          <p className="text-gray-500 mt-1">
            Toplam {total} sipariş
            {(selectedUserId || productId) && (
              <span className="ml-2">
                — Filtreleniyor
                <button onClick={clearUserFilter} className="ml-2 text-primary-600 hover:underline">Filtreyi kaldır</button>
              </span>
            )}
          </p>
        </div>

        {/* Filters */}
        <div className="flex flex-col gap-3">
          {/* Row 1: Search + Status */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400 pointer-events-none shrink-0" />
              <input
                type="text"
                placeholder="Sipariş no, kullanıcı veya ürün ara..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="admin-input admin-input-with-icon-left"
              />
            </div>
            <select
              value={status}
              onChange={(e) => { setStatus(e.target.value); setPage(1); }}
              className="admin-input w-full sm:w-48"
            >
              {statusOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {/* Row 2: User filter */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
            <div className="relative flex-1 w-full sm:max-w-xs" ref={dropdownRef}>
              <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none shrink-0" />
              <input
                type="text"
                placeholder="Kullanıcı ara..."
                value={userSearch}
                onChange={(e) => {
                  setUserSearch(e.target.value);
                  setShowUserDropdown(true);
                }}
                onFocus={() => setShowUserDropdown(true)}
                className="admin-input admin-input-with-icon-left-sm pr-9"
              />
              {selectedUserId && (
                <button
                  onClick={clearUserFilter}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  <XCircleIcon className="h-4 w-4" />
                </button>
              )}

              {showUserDropdown && userSearch.length >= 2 && (
                <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                  {loadingUsers ? (
                    <div className="p-3 text-center text-gray-500 text-sm">Aranıyor...</div>
                  ) : users.length > 0 ? (
                    users.map((user) => (
                      <button
                        key={user.id}
                        onClick={() => handleSelectUser(user)}
                        className="w-full px-4 py-2 text-left hover:bg-gray-50 text-gray-900"
                      >
                        <div className="font-medium text-sm">{user.displayName}</div>
                        <div className="text-xs text-gray-500">{user.email}</div>
                      </button>
                    ))
                  ) : (
                    <div className="p-3 text-center text-gray-500 text-sm">Kullanıcı bulunamadı</div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="admin-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Sipariş No</th>
                  <th>Durum</th>
                  <th>Alıcı</th>
                  <th>Satıcı</th>
                  <th>Ürün</th>
                  <th className="text-right">Tutar</th>
                  <th className="text-right">Komisyon</th>
                  <th>Tarih</th>
                  <th className="text-center">İşlemler</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={9} className="text-center py-12">
                      <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary-500 mx-auto"></div>
                    </td>
                  </tr>
                ) : orders.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="text-center py-12 text-gray-400">
                      {debouncedSearch || status !== 'all' || selectedUserId
                        ? 'Filtreye uygun sipariş bulunamadı'
                        : 'Henüz sipariş yok'}
                    </td>
                  </tr>
                ) : (
                  orders.map((order) => (
                    <tr key={order.id} className="group hover:bg-gray-50/50">
                      <td>
                        <Link href={`/orders/${order.id}`} className="font-mono text-sm text-primary-600 hover:underline">
                          {order.orderNumber}
                        </Link>
                      </td>
                      <td>
                        {editingOrderId === order.id ? (
                          <div className="flex items-center gap-1.5">
                            <select
                              value={newStatus}
                              onChange={(e) => setNewStatus(e.target.value)}
                              className="admin-input py-1 px-2 text-xs w-32"
                              disabled={updatingStatus}
                            >
                              <option value="pending_payment">Ödeme Bekliyor</option>
                              <option value="paid">Ödendi</option>
                              <option value="preparing">Hazırlanıyor</option>
                              <option value="shipped">Kargoda</option>
                              <option value="delivered">Teslim Edildi</option>
                              <option value="completed">Tamamlandı</option>
                              <option value="cancelled">İptal</option>
                            </select>
                            <button
                              onClick={() => updateOrderStatus(order.id)}
                              disabled={updatingStatus}
                              className="p-1 text-green-600 hover:bg-green-50 rounded"
                              title="Kaydet"
                            >
                              <CheckIcon className="h-4 w-4" />
                            </button>
                            <button
                              onClick={cancelEditing}
                              disabled={updatingStatus}
                              className="p-1 text-red-500 hover:bg-red-50 rounded"
                              title="İptal"
                            >
                              <XMarkIcon className="h-4 w-4" />
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5">
                            {getStatusBadge(order.status)}
                          </div>
                        )}
                      </td>
                      <td>
                        <Link
                          href={`/users/${order.buyer.id}`}
                          className="text-sm text-gray-900 hover:text-primary-600"
                        >
                          {order.buyer.displayName}
                        </Link>
                      </td>
                      <td>
                        <Link
                          href={`/users/${order.seller.id}`}
                          className="text-sm text-gray-900 hover:text-primary-600"
                        >
                          {order.seller.displayName}
                        </Link>
                      </td>
                      <td>
                        <span className="text-sm text-gray-700 truncate block max-w-[180px]" title={order.product?.title}>
                          {order.product?.title || `${order.itemCount} adet`}
                        </span>
                      </td>
                      <td className="text-right text-primary-600 font-medium text-sm tabular-nums">
                        ₺{order.totalAmount.toLocaleString('tr-TR')}
                      </td>
                      <td className="text-right text-green-600 text-sm tabular-nums">
                        ₺{order.commission.toLocaleString('tr-TR')}
                      </td>
                      <td className="whitespace-nowrap text-sm text-gray-500">
                        {new Date(order.createdAt).toLocaleDateString('tr-TR')}
                      </td>
                      <td>
                        <div className="flex items-center justify-center gap-1">
                          <button
                            onClick={() => startEditing(order)}
                            className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-md transition-colors"
                            title="Durumu Değiştir"
                          >
                            <PencilIcon className="h-4 w-4" />
                          </button>
                          <Link
                            href={`/orders/${order.id}`}
                            className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-md transition-colors"
                            title="Detay"
                          >
                            <EyeIcon className="h-4 w-4" />
                          </Link>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Pagination */}
        {total > 0 && (
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-500">
              Sayfa {page} / {totalPages} ({total} sonuç)
            </p>
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
                disabled={page >= totalPages}
                className="btn-secondary disabled:opacity-50"
              >
                Sonraki
              </button>
            </div>
          </div>
        )}
      </div>
  );
}
