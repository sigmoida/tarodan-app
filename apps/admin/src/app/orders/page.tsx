'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import AdminLayout from '@/components/AdminLayout';
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
  const urlUserRole = useMemo(() => (searchParams.get('userRole') === 'buyer' || searchParams.get('userRole') === 'seller' ? searchParams.get('userRole') : '') as '' | 'buyer' | 'seller', [searchParams]);
  const productId = useMemo(() => searchParams.get('productId') || undefined, [searchParams]);

  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [editingOrderId, setEditingOrderId] = useState<string | null>(null);
  const [newStatus, setNewStatus] = useState<string>('');
  const [updatingStatus, setUpdatingStatus] = useState(false);

  // User filtering
  const [users, setUsers] = useState<User[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string>(urlUserId);
  const [userRole, setUserRole] = useState<'buyer' | 'seller' | ''>(urlUserRole);
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

  // Sync URL with state
  useEffect(() => {
    setSelectedUserId(urlUserId);
    setUserRole(urlUserRole);
  }, [urlUserId, urlUserRole]);

  const updateUrl = (userId: string, role: '' | 'buyer' | 'seller') => {
    const params = new URLSearchParams(searchParams.toString());
    if (userId) params.set('userId', userId);
    else params.delete('userId');
    if (role) params.set('userRole', role);
    else params.delete('userRole');
    router.push(`/orders?${params.toString()}`);
  };

  const handleSelectUser = (user: User) => {
    setSelectedUserId(user.id);
    setUserSearch(user.displayName);
    setShowUserDropdown(false);
    updateUrl(user.id, userRole);
  };

  const handleUserRoleChange = (role: 'buyer' | 'seller' | '') => {
    setUserRole(role);
    if (selectedUserId) updateUrl(selectedUserId, role);
  };

  const clearUserFilter = () => {
    setSelectedUserId('');
    setUserSearch('');
    setUserRole('');
    const params = new URLSearchParams(searchParams.toString());
    params.delete('userId');
    params.delete('userRole');
    router.push(`/orders?${params.toString()}`);
  };

  useEffect(() => {
    loadOrders();
  }, [page, status, selectedUserId, userRole, productId]);

  const loadOrders = async () => {
    setLoading(true);
    try {
      const response = await adminApi.getOrders({
        page,
        limit: 20,
        status: status === 'all' ? undefined : status,
        search: search || undefined,
        userId: selectedUserId || undefined,
        userRole: selectedUserId && userRole ? userRole : undefined,
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
    return <span className={`badge ${colors[status]}`}>{labels[status]}</span>;
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Siparişler</h1>
          <p className="text-gray-400 mt-1">
            Toplam {total} sipariş
            {(selectedUserId || productId) && (
              <span className="ml-2">
                — Filtreleniyor
                <button onClick={clearUserFilter} className="ml-2 text-primary-500 hover:underline">Filtreyi kaldır</button>
              </span>
            )}
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
            <input
              type="text"
              placeholder="Sipariş no ara..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="admin-input pl-10"
            />
          </div>
          
          {/* User Filter */}
          <div className="w-full sm:w-64 space-y-2">
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => handleUserRoleChange(userRole === 'buyer' ? '' : 'buyer')}
                className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  userRole === 'buyer'
                    ? 'bg-primary-500 text-white'
                    : 'bg-dark-700 text-gray-400 hover:text-white'
                }`}
              >
                Alıcı
              </button>
              <button
                type="button"
                onClick={() => handleUserRoleChange(userRole === 'seller' ? '' : 'seller')}
                className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  userRole === 'seller'
                    ? 'bg-primary-500 text-white'
                    : 'bg-dark-700 text-gray-400 hover:text-white'
                }`}
              >
                Satıcı
              </button>
            </div>
            <div className="relative">
              <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
              <input
                type="text"
                placeholder="Kullanıcı ara..."
                value={userSearch}
                onChange={(e) => {
                  setUserSearch(e.target.value);
                  setShowUserDropdown(true);
                }}
                onFocus={() => setShowUserDropdown(true)}
                className="admin-input pl-10 pr-10 w-full"
              />
            {selectedUserId && (
              <button
                onClick={clearUserFilter}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white"
              >
                <XCircleIcon className="h-5 w-5" />
              </button>
            )}
            
              {showUserDropdown && userSearch.length >= 2 && (
                <div className="absolute z-50 w-full mt-1 bg-dark-700 border border-dark-600 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                  {loadingUsers ? (
                    <div className="p-3 text-center text-gray-400">Aranıyor...</div>
                  ) : users.length > 0 ? (
                    users.map((user) => (
                      <button
                        key={user.id}
                        onClick={() => handleSelectUser(user)}
                        className="w-full px-4 py-2 text-left hover:bg-dark-600 text-white"
                      >
                        <div className="font-medium">{user.displayName}</div>
                        <div className="text-xs text-gray-400">{user.email}</div>
                      </button>
                    ))
                  ) : (
                    <div className="p-3 text-center text-gray-400">Kullanıcı bulunamadı</div>
                  )}
                </div>
              )}
            </div>
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
                  <th>Sipariş No</th>
                  <th>Durum</th>
                  <th>Alıcı</th>
                  <th>Satıcı</th>
                  <th>Ürün</th>
                  <th>Tutar</th>
                  <th>Komisyon</th>
                  <th>Tarih</th>
                  <th>İşlemler</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={9} className="text-center py-8">
                      <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary-500 mx-auto"></div>
                    </td>
                  </tr>
                ) : orders.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="text-center py-8 text-gray-400">
                      Sipariş bulunamadı
                    </td>
                  </tr>
                ) : (
                  orders.map((order) => (
                    <tr key={order.id}>
                      <td className="font-mono text-sm">{order.orderNumber}</td>
                      <td>
                        {editingOrderId === order.id ? (
                          <div className="flex items-center gap-2">
                            <select
                              value={newStatus}
                              onChange={(e) => setNewStatus(e.target.value)}
                              className="admin-input py-1 px-2 text-sm w-36"
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
                              className="p-1 text-green-400 hover:text-green-300 hover:bg-green-900/30 rounded"
                              title="Kaydet"
                            >
                              <CheckIcon className="h-4 w-4" />
                            </button>
                            <button
                              onClick={cancelEditing}
                              disabled={updatingStatus}
                              className="p-1 text-red-400 hover:text-red-300 hover:bg-red-900/30 rounded"
                              title="İptal"
                            >
                              <XMarkIcon className="h-4 w-4" />
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            {getStatusBadge(order.status)}
                            <button
                              onClick={() => startEditing(order)}
                              className="p-1 text-gray-500 hover:text-white hover:bg-dark-700 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                              title="Durumu Değiştir"
                            >
                              <PencilIcon className="h-3 w-3" />
                            </button>
                          </div>
                        )}
                      </td>
                      <td>
                        <Link
                          href={`/users/${order.buyer.id}`}
                          className="text-white hover:text-primary-500"
                        >
                          {order.buyer.displayName}
                        </Link>
                      </td>
                      <td>
                        <Link
                          href={`/users/${order.seller.id}`}
                          className="text-white hover:text-primary-500"
                        >
                          {order.seller.displayName}
                        </Link>
                      </td>
                      <td>{order.itemCount} adet</td>
                      <td className="text-primary-400 font-medium">
                        ₺{order.totalAmount.toLocaleString()}
                      </td>
                      <td className="text-green-400">
                        ₺{order.commission.toLocaleString()}
                      </td>
                      <td>{new Date(order.createdAt).toLocaleDateString('tr-TR')}</td>
                      <td>
                        <div className="flex gap-1">
                          <button
                            onClick={() => startEditing(order)}
                            className="p-2 text-blue-400 hover:text-blue-300 hover:bg-blue-900/30 rounded-lg"
                            title="Durumu Değiştir"
                          >
                            <PencilIcon className="h-5 w-5" />
                          </button>
                            <Link
                              href={`/orders/${order.id}`}
                              className="p-2 text-gray-400 hover:text-white hover:bg-dark-700 rounded-lg"
                              title="Detay"
                            >
                              <EyeIcon className="h-5 w-5" />
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
