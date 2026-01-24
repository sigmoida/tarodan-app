'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  MagnifyingGlassIcon,
  FunnelIcon,
  ArrowPathIcon,
  CreditCardIcon,
  ChartBarIcon,
} from '@heroicons/react/24/outline';
import { adminApi } from '@/lib/api';
import toast from 'react-hot-toast';

interface Payment {
  id: string;
  orderId: string;
  orderNumber: string;
  amount: number;
  currency: string;
  provider: string;
  status: string;
  failureReason?: string;
  providerPaymentId?: string;
  buyer: {
    id: string;
    displayName: string;
    email: string;
  };
  seller: {
    id: string;
    displayName: string;
    email: string;
  };
  product: {
    id: string;
    title: string;
  };
  createdAt: string;
  updatedAt: string;
  paidAt?: string;
}

interface PaymentListResponse {
  data: Payment[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

const statusConfig: Record<string, { label: string; color: string; bg: string }> = {
  pending: { label: 'Bekliyor', color: 'text-yellow-600', bg: 'bg-yellow-100' },
  processing: { label: 'İşleniyor', color: 'text-blue-600', bg: 'bg-blue-100' },
  completed: { label: 'Tamamlandı', color: 'text-green-600', bg: 'bg-green-100' },
  failed: { label: 'Başarısız', color: 'text-red-600', bg: 'bg-red-100' },
  refunded: { label: 'İade Edildi', color: 'text-gray-600', bg: 'bg-gray-100' },
};

export default function AdminPaymentsPage() {
  const router = useRouter();
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 0,
  });
  const [filters, setFilters] = useState({
    status: '',
    provider: '',
    startDate: '',
    endDate: '',
    search: '',
  });
  const [showFilters, setShowFilters] = useState(false);

  useEffect(() => {
    loadPayments();
  }, [pagination.page, filters]);

  const loadPayments = async () => {
    setLoading(true);
    try {
      const params: any = {
        page: pagination.page,
        limit: pagination.limit,
      };
      if (filters.status) params.status = filters.status;
      if (filters.provider) params.provider = filters.provider;
      if (filters.startDate) params.startDate = filters.startDate;
      if (filters.endDate) params.endDate = filters.endDate;
      if (filters.search) params.search = filters.search;

      const response = await adminApi.getPayments(params);
      const data: PaymentListResponse = response.data;
      setPayments(data.data || []);
      setPagination({
        ...pagination,
        total: data.meta.total,
        totalPages: data.meta.totalPages,
      });
    } catch (error: any) {
      console.error('Payment load error:', error);
      toast.error(error.response?.data?.message || 'Ödemeler yüklenemedi');
    } finally {
      setLoading(false);
    }
  };

  const handlePageChange = (newPage: number) => {
    setPagination({ ...pagination, page: newPage });
  };

  const handleFilterChange = (key: string, value: string) => {
    setFilters({ ...filters, [key]: value });
    setPagination({ ...pagination, page: 1 });
  };

  const clearFilters = () => {
    setFilters({
      status: '',
      provider: '',
      startDate: '',
      endDate: '',
      search: '',
    });
    setPagination({ ...pagination, page: 1 });
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <main className="max-w-7xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Ödeme Yönetimi</h1>
            <p className="text-gray-600">Tüm ödeme işlemlerini görüntüleyin ve yönetin</p>
          </div>
          <div className="flex gap-3">
            <Link
              href="/admin/payments/statistics"
              className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 flex items-center gap-2"
            >
              <ChartBarIcon className="w-5 h-5" />
              İstatistikler
            </Link>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-xl shadow-sm p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
              <FunnelIcon className="w-5 h-5" />
              Filtreler
            </h2>
            <button
              onClick={() => setShowFilters(!showFilters)}
              className="text-primary-600 hover:text-primary-700"
            >
              {showFilters ? 'Gizle' : 'Göster'}
            </button>
          </div>

          {showFilters && (
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Arama</label>
                <div className="relative">
                  <MagnifyingGlassIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    type="text"
                    value={filters.search}
                    onChange={(e) => handleFilterChange('search', e.target.value)}
                    placeholder="Sipariş no, transaction ID..."
                    className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Durum</label>
                <select
                  value={filters.status}
                  onChange={(e) => handleFilterChange('status', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                >
                  <option value="">Tümü</option>
                  <option value="pending">Bekliyor</option>
                  <option value="processing">İşleniyor</option>
                  <option value="completed">Tamamlandı</option>
                  <option value="failed">Başarısız</option>
                  <option value="refunded">İade Edildi</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Sağlayıcı</label>
                <select
                  value={filters.provider}
                  onChange={(e) => handleFilterChange('provider', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                >
                  <option value="">Tümü</option>
                  <option value="iyzico">Iyzico</option>
                  <option value="paytr">PayTR</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Başlangıç Tarihi</label>
                <input
                  type="date"
                  value={filters.startDate}
                  onChange={(e) => handleFilterChange('startDate', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Bitiş Tarihi</label>
                <input
                  type="date"
                  value={filters.endDate}
                  onChange={(e) => handleFilterChange('endDate', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                />
              </div>
            </div>
          )}

          {showFilters && (
            <div className="mt-4 flex justify-end">
              <button
                onClick={clearFilters}
                className="px-4 py-2 text-gray-600 hover:text-gray-800"
              >
                Filtreleri Temizle
              </button>
            </div>
          )}
        </div>

        {/* Payments List */}
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          {loading ? (
            <div className="p-12 text-center">
              <ArrowPathIcon className="w-12 h-12 text-primary-500 animate-spin mx-auto mb-4" />
              <p className="text-gray-500">Yükleniyor...</p>
            </div>
          ) : payments.length === 0 ? (
            <div className="p-12 text-center">
              <CreditCardIcon className="w-16 h-16 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-500 text-lg">Ödeme bulunamadı</p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Sipariş No
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Alıcı/Satıcı
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Tutar
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Sağlayıcı
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Durum
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Tarih
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        İşlemler
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {payments.map((payment) => {
                      const statusInfo = statusConfig[payment.status] || statusConfig.pending;

                      return (
                        <tr key={payment.id} className="hover:bg-gray-50">
                          <td className="px-6 py-4 whitespace-nowrap">
                            <Link
                              href={`/admin/orders/${payment.orderId}`}
                              className="text-primary-600 hover:text-primary-700 font-medium"
                            >
                              #{payment.orderNumber}
                            </Link>
                          </td>
                          <td className="px-6 py-4">
                            <div className="text-sm">
                              <p className="font-medium text-gray-900">Alıcı: {payment.buyer.displayName}</p>
                              <p className="text-gray-500 text-xs">{payment.buyer.email}</p>
                              <p className="font-medium text-gray-900 mt-1">Satıcı: {payment.seller.displayName}</p>
                              <p className="text-gray-500 text-xs">{payment.seller.email}</p>
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className="text-sm font-medium text-gray-900">
                              ₺{payment.amount.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className="text-sm text-gray-600 uppercase">{payment.provider}</span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span
                              className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${statusInfo.color} ${statusInfo.bg}`}
                            >
                              {statusInfo.label}
                            </span>
                            {payment.failureReason && (
                              <p className="text-xs text-red-600 mt-1">{payment.failureReason}</p>
                            )}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            {new Date(payment.createdAt).toLocaleDateString('tr-TR', {
                              year: 'numeric',
                              month: 'short',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm">
                            <Link
                              href={`/admin/payments/${payment.id}`}
                              className="text-primary-600 hover:text-primary-700"
                            >
                              Detay
                            </Link>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {pagination.totalPages > 1 && (
                <div className="bg-gray-50 px-6 py-4 flex items-center justify-between border-t border-gray-200">
                  <div className="text-sm text-gray-700">
                    Toplam {pagination.total} ödeme, Sayfa {pagination.page} / {pagination.totalPages}
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handlePageChange(pagination.page - 1)}
                      disabled={pagination.page === 1}
                      className="px-4 py-2 border border-gray-300 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
                    >
                      Önceki
                    </button>
                    <button
                      onClick={() => handlePageChange(pagination.page + 1)}
                      disabled={pagination.page >= pagination.totalPages}
                      className="px-4 py-2 border border-gray-300 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
                    >
                      Sonraki
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </main>
    </div>
  );
}
