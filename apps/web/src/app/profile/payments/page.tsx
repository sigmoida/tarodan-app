'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/stores/authStore';
import { paymentsApi } from '@/lib/api';
import {
  CheckCircleIcon,
  XCircleIcon,
  ArrowPathIcon,
  CreditCardIcon,
  CalendarIcon,
  FunnelIcon,
} from '@heroicons/react/24/outline';
import { useTranslation } from '@/i18n/LanguageContext';

interface Payment {
  id: string;
  orderId: string;
  orderNumber: string;
  amount: number;
  currency: string;
  provider: string;
  status: string;
  failureReason?: string;
  providerTransactionId?: string;
  product: {
    id: string;
    title: string;
    images?: string[];
  };
  buyer: {
    id: string;
    displayName: string;
  };
  seller: {
    id: string;
    displayName: string;
  };
  createdAt: string;
  updatedAt: string;
  paidAt?: string;
}

interface PaymentListResponse {
  payments: Payment[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

const getStatusConfig = (locale: string) => ({
  pending: {
    label: locale === 'en' ? 'Pending' : 'Bekliyor',
    color: 'text-yellow-600',
    bg: 'bg-yellow-100',
    icon: ArrowPathIcon,
  },
  processing: {
    label: locale === 'en' ? 'Processing' : 'İşleniyor',
    color: 'text-blue-600',
    bg: 'bg-blue-100',
    icon: ArrowPathIcon,
  },
  completed: {
    label: locale === 'en' ? 'Completed' : 'Tamamlandı',
    color: 'text-green-600',
    bg: 'bg-green-100',
    icon: CheckCircleIcon,
  },
  failed: {
    label: locale === 'en' ? 'Failed' : 'Başarısız',
    color: 'text-red-600',
    bg: 'bg-red-100',
    icon: XCircleIcon,
  },
  refunded: {
    label: locale === 'en' ? 'Refunded' : 'İade Edildi',
    color: 'text-gray-600',
    bg: 'bg-gray-100',
    icon: XCircleIcon,
  },
});

export default function PaymentHistoryPage() {
  const router = useRouter();
  const { isAuthenticated, user } = useAuthStore();
  const { t, locale } = useTranslation();
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
  });
  const [showFilters, setShowFilters] = useState(false);

  useEffect(() => {
    if (!isAuthenticated) {
      router.push('/login');
      return;
    }
    loadPayments();
  }, [isAuthenticated, pagination.page, filters]);

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

      const response = await paymentsApi.getMyPayments(params);
      const data: PaymentListResponse = response.data;
      setPayments(data.payments || []);
      setPagination(data.pagination || pagination);
    } catch (error: any) {
      console.error('Payment load error:', error);
      toast.error(error.response?.data?.message || t('payment.loadFailed'));
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = async (paymentId: string) => {
    if (!confirm(t('payment.cancelConfirm'))) {
      return;
    }

    try {
      await paymentsApi.cancel(paymentId);
      toast.success(t('payment.cancelled'));
      loadPayments();
    } catch (error: any) {
      toast.error(error.response?.data?.message || t('payment.cancelFailed'));
    }
  };

  const handleRetry = async (paymentId: string) => {
    if (!confirm(t('payment.retryConfirm'))) {
      return;
    }

    try {
      const response = await paymentsApi.retry(paymentId);
      toast.success(t('payment.retried'));
      if (response.data.paymentUrl) {
        window.location.href = response.data.paymentUrl;
      } else {
        loadPayments();
      }
    } catch (error: any) {
      toast.error(error.response?.data?.message || t('payment.retryFailed'));
    }
  };

  const handlePageChange = (newPage: number) => {
    setPagination({ ...pagination, page: newPage });
  };

  const handleFilterChange = (key: string, value: string) => {
    setFilters({ ...filters, [key]: value });
    setPagination({ ...pagination, page: 1 }); // Reset to first page on filter change
  };

  const clearFilters = () => {
    setFilters({
      status: '',
      provider: '',
      startDate: '',
      endDate: '',
    });
    setPagination({ ...pagination, page: 1 });
  };

  if (!isAuthenticated || loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary-500"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <main className="max-w-6xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">{t('payment.history')}</h1>
          <p className="text-gray-600">{t('payment.historyDesc')}</p>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-xl shadow-sm p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
              <FunnelIcon className="w-5 h-5" />
              {t('common.filter')}
            </h2>
            <button
              onClick={() => setShowFilters(!showFilters)}
              className="text-primary-600 hover:text-primary-700"
            >
              {showFilters ? t('common.hide') : t('common.show')}
            </button>
          </div>

          {showFilters && (
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">{t('common.status')}</label>
                <select
                  value={filters.status}
                  onChange={(e) => handleFilterChange('status', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                >
                  <option value="">{t('common.all')}</option>
                  <option value="pending">{locale === 'en' ? 'Pending' : 'Bekliyor'}</option>
                  <option value="processing">{locale === 'en' ? 'Processing' : 'İşleniyor'}</option>
                  <option value="completed">{locale === 'en' ? 'Completed' : 'Tamamlandı'}</option>
                  <option value="failed">{locale === 'en' ? 'Failed' : 'Başarısız'}</option>
                  <option value="refunded">{locale === 'en' ? 'Refunded' : 'İade Edildi'}</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">{t('payment.provider')}</label>
                <select
                  value={filters.provider}
                  onChange={(e) => handleFilterChange('provider', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                >
                  <option value="">{t('common.all')}</option>
                  <option value="iyzico">Iyzico</option>
                  <option value="paytr">PayTR</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">{t('payment.startDate')}</label>
                <input
                  type="date"
                  value={filters.startDate}
                  onChange={(e) => handleFilterChange('startDate', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">{t('payment.endDate')}</label>
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
                {t('product.clearFilters')}
              </button>
            </div>
          )}
        </div>

        {/* Payments List */}
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          {payments.length === 0 ? (
            <div className="p-12 text-center">
              <CreditCardIcon className="w-16 h-16 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-500 text-lg">{t('payment.noHistory')}</p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        {t('order.orderNumber')}
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        {locale === 'en' ? 'Product' : 'Ürün'}
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        {t('common.amount')}
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        {t('payment.provider')}
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        {t('common.status')}
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        {t('common.date')}
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        {t('common.actions')}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {payments.map((payment) => {
                      const statusConfig = getStatusConfig(locale);
                      const statusInfo = statusConfig[payment.status as keyof typeof statusConfig] || statusConfig.pending;
                      const StatusIcon = statusInfo.icon;

                      return (
                        <tr key={payment.id} className="hover:bg-gray-50">
                          <td className="px-6 py-4 whitespace-nowrap">
                            <Link
                              href={`/orders/${payment.orderId}`}
                              className="text-primary-600 hover:text-primary-700 font-medium"
                            >
                              #{payment.orderNumber}
                            </Link>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-3">
                              {payment.product.images && payment.product.images[0] ? (
                                <img
                                  src={payment.product.images[0]}
                                  alt={payment.product.title}
                                  className="w-12 h-12 object-cover rounded"
                                />
                              ) : (
                                <div className="w-12 h-12 bg-gray-200 rounded flex items-center justify-center">
                                  <CreditCardIcon className="w-6 h-6 text-gray-400" />
                                </div>
                              )}
                              <div>
                                <p className="text-sm font-medium text-gray-900">
                                  {payment.product.title}
                                </p>
                                <p className="text-xs text-gray-500">
                                  {user?.id === payment.buyer.id ? (locale === 'en' ? 'Buyer' : 'Alıcı') : (locale === 'en' ? 'Seller' : 'Satıcı')}:{' '}
                                  {user?.id === payment.buyer.id
                                    ? payment.seller.displayName
                                    : payment.buyer.displayName}
                                </p>
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className="text-sm font-medium text-gray-900">
                              {payment.amount.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} TL
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className="text-sm text-gray-600 uppercase">{payment.provider}</span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span
                              className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium ${statusInfo.color} ${statusInfo.bg}`}
                            >
                              <StatusIcon className="w-4 h-4" />
                              {statusInfo.label}
                            </span>
                            {payment.failureReason && (
                              <p className="text-xs text-red-600 mt-1">{payment.failureReason}</p>
                            )}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            <div className="flex items-center gap-1">
                              <CalendarIcon className="w-4 h-4" />
                              {new Date(payment.createdAt).toLocaleDateString('tr-TR', {
                                year: 'numeric',
                                month: 'short',
                                day: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm">
                            <div className="flex items-center gap-2">
                              <Link
                                href={`/orders/${payment.orderId}`}
                                className="text-primary-600 hover:text-primary-700"
                              >
                                {t('common.details')}
                              </Link>
                              {payment.status === 'pending' && (
                                <button
                                  onClick={() => handleCancel(payment.id)}
                                  className="text-red-600 hover:text-red-700"
                                >
                                  {t('common.cancel')}
                                </button>
                              )}
                              {payment.status === 'failed' && (
                                <button
                                  onClick={() => handleRetry(payment.id)}
                                  className="text-blue-600 hover:text-blue-700"
                                >
                                  {t('payment.retry')}
                                </button>
                              )}
                            </div>
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
                    {locale === 'en' 
                      ? `Total ${pagination.total} payments, Page ${pagination.page} / ${pagination.totalPages}`
                      : `Toplam ${pagination.total} ödeme, Sayfa ${pagination.page} / ${pagination.totalPages}`}
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handlePageChange(pagination.page - 1)}
                      disabled={pagination.page === 1}
                      className="px-4 py-2 border border-gray-300 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
                    >
                      {t('common.previous')}
                    </button>
                    <button
                      onClick={() => handlePageChange(pagination.page + 1)}
                      disabled={pagination.page >= pagination.totalPages}
                      className="px-4 py-2 border border-gray-300 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
                    >
                      {t('common.next')}
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
