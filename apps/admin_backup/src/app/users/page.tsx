'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import AdminLayout from '@/components/AdminLayout';
import { adminApi } from '@/lib/api';
import {
  MagnifyingGlassIcon,
  FunnelIcon,
  EyeIcon,
  NoSymbolIcon,
  CheckCircleIcon,
} from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';

interface User {
  id: string;
  email: string;
  displayName: string;
  phone?: string;
  isSeller: boolean;
  isVerified: boolean;
  isBanned: boolean;
  createdAt: string;
  membershipTier?: string;
  ordersCount: number;
  productsCount: number;
}

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    loadUsers();
  }, [page, filter]);

  const loadUsers = async () => {
    setLoading(true);
    try {
      const response = await adminApi.getUsers({
        page,
        limit: 20,
        search: search || undefined,
        isSeller: filter === 'sellers' ? true : filter === 'buyers' ? false : undefined,
      });
      const data = response.data.data || response.data.users || [];
      const meta = response.data.meta || {};
      setUsers(data.map((u: any) => ({
        id: u.id,
        email: u.email,
        displayName: u.displayName,
        phone: u.phone,
        isSeller: u.isSeller,
        isVerified: u.isVerified,
        isBanned: false, // Not in API response yet
        createdAt: u.createdAt,
        membershipTier: 'basic', // Not in API response yet
        ordersCount: u._count?.buyerOrders || 0,
        productsCount: u._count?.products || 0,
      })));
      setTotal(meta.total || data.length);
    } catch (error) {
      console.error('Users load error:', error);
      toast.error('Kullanıcılar yüklenemedi');
    } finally {
      setLoading(false);
    }
  };

  const handleBanUser = async (userId: string, isBanned: boolean) => {
    try {
      if (isBanned) {
        await adminApi.unbanUser(userId);
        toast.success('Kullanıcı engeli kaldırıldı');
      } else {
        await adminApi.banUser(userId);
        toast.success('Kullanıcı engellendi');
      }
      loadUsers();
    } catch (error) {
      toast.error('İşlem başarısız');
    }
  };

  const filteredUsers = users.filter((user) => {
    if (search) {
      const searchLower = search.toLowerCase();
      if (
        !user.email.toLowerCase().includes(searchLower) &&
        !user.displayName.toLowerCase().includes(searchLower)
      ) {
        return false;
      }
    }
    if (filter === 'sellers' && !user.isSeller) return false;
    if (filter === 'buyers' && user.isSeller) return false;
    if (filter === 'banned' && !user.isBanned) return false;
    return true;
  });

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white">Kullanıcılar</h1>
            <p className="text-gray-400 mt-1">Toplam {total} kullanıcı</p>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
            <input
              type="text"
              placeholder="E-posta veya isim ara..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="admin-input pl-10"
            />
          </div>
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="admin-input w-full sm:w-48"
          >
            <option value="all">Tüm Kullanıcılar</option>
            <option value="sellers">Satıcılar</option>
            <option value="buyers">Alıcılar</option>
            <option value="banned">Engelliler</option>
          </select>
        </div>

        {/* Table */}
        <div className="admin-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Kullanıcı</th>
                  <th>Durum</th>
                  <th>Üyelik</th>
                  <th>Sipariş</th>
                  <th>Ürün</th>
                  <th>Kayıt Tarihi</th>
                  <th>İşlemler</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={7} className="text-center py-8">
                      <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary-500 mx-auto"></div>
                    </td>
                  </tr>
                ) : filteredUsers.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-center py-8 text-gray-400">
                      Kullanıcı bulunamadı
                    </td>
                  </tr>
                ) : (
                  filteredUsers.map((user) => (
                    <tr key={user.id}>
                      <td>
                        <div className="flex items-center">
                          <div className="w-10 h-10 rounded-full bg-primary-500/20 flex items-center justify-center mr-3">
                            <span className="text-primary-500 font-medium">
                              {user.displayName.charAt(0)}
                            </span>
                          </div>
                          <div>
                            <p className="font-medium text-white">{user.displayName}</p>
                            <p className="text-sm text-gray-400">{user.email}</p>
                          </div>
                        </div>
                      </td>
                      <td>
                        <div className="flex flex-col gap-1">
                          {user.isSeller && (
                            <span className="badge badge-info">Satıcı</span>
                          )}
                          {user.isVerified && (
                            <span className="badge badge-success">Doğrulanmış</span>
                          )}
                          {user.isBanned && (
                            <span className="badge badge-danger">Engelli</span>
                          )}
                        </div>
                      </td>
                      <td>
                        <span
                          className={`badge ${
                            user.membershipTier === 'premium'
                              ? 'badge-warning'
                              : 'badge-gray'
                          }`}
                        >
                          {user.membershipTier || 'Free'}
                        </span>
                      </td>
                      <td>{user.ordersCount}</td>
                      <td>{user.productsCount}</td>
                      <td>
                        {new Date(user.createdAt).toLocaleDateString('tr-TR')}
                      </td>
                      <td>
                        <div className="flex items-center gap-2">
                          <Link
                            href={`/admin/users/${user.id}`}
                            className="p-2 text-gray-400 hover:text-white hover:bg-dark-700 rounded-lg"
                            title="Detay"
                          >
                            <EyeIcon className="h-5 w-5" />
                          </Link>
                          <button
                            onClick={() => handleBanUser(user.id, user.isBanned)}
                            className={`p-2 rounded-lg ${
                              user.isBanned
                                ? 'text-green-400 hover:bg-green-500/10'
                                : 'text-red-400 hover:bg-red-500/10'
                            }`}
                            title={user.isBanned ? 'Engeli Kaldır' : 'Engelle'}
                          >
                            {user.isBanned ? (
                              <CheckCircleIcon className="h-5 w-5" />
                            ) : (
                              <NoSymbolIcon className="h-5 w-5" />
                            )}
                          </button>
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
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-400">
            Sayfa {page} / {Math.ceil(total / 20)}
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
