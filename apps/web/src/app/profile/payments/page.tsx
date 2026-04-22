'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/stores/authStore';
import AuthLoadingScreen from '@/components/AuthLoadingScreen';
import { paymentsApi } from '@/lib/api';
import {
  CreditCardIcon,
  CalendarIcon,
  FunnelIcon,
} from '@heroicons/react/24/outline';
import { useTranslation } from '@/i18n/LanguageContext';
import { Button, Input, Select, Spinner, StatusBadge, paymentStatusConfig } from '@tarodan/ui';

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

const paymentStatusEnLabels: Record<string, string> = {
  pending: 'Pending',
  processing: 'Processing',
  completed: 'Completed',
  failed: 'Failed',
  refunded: 'Refunded',
  cancelled: 'Cancelled',
};

export default function PaymentHistoryPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { isAuthenticated, isLoading: authLoading, user } = useAuthStore();
  const { t, locale } = useTranslation();
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
    if (authLoading) return;
    if (!isAuthenticated) {
      router.push('/login');
      return;
    }
  }, [authLoading, isAuthenticated, router]);

  const paymentsQuery = useQuery({
    queryKey: ['profile-payments', pagination.page, filters],
    queryFn: async (): Promise<PaymentListResponse> => {
      const params: any = { page: pagination.page, limit: pagination.limit };
      if (filters.status) params.status = filters.status;
      if (filters.provider) params.provider = filters.provider;
      if (filters.startDate) params.startDate = filters.startDate;
      if (filters.endDate) params.endDate = filters.endDate;
      const response = await paymentsApi.getMyPayments(params);
      return response.data;
    },
    enabled: !authLoading && isAuthenticated,
    meta: { page: 'profile-payments' },
  });
  const data = paymentsQuery.data;
  const payments = data?.payments ?? [];
  const loading = paymentsQuery.isLoading;
  useEffect(() => {
    if (data?.pagination) setPagination(prev => ({ ...prev, ...data.pagination }));
  }, [data?.pagination]);

  const invalidatePayments = () => queryClient.invalidateQueries({ queryKey: ['profile-payments'] });

  const handleCancel = async (paymentId: string) => {
    if (!confirm(t('payment.cancelConfirm'))) return;
    try {
      await paymentsApi.cancel(paymentId);
      toast.success(t('payment.cancelled'));
      await invalidatePayments();
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
        await invalidatePayments();
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

  if (authLoading) {
    return <AuthLoadingScreen />;
  }
  if (!isAuthenticated || loading) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center">
        <Spinner size="xl" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface">
      <main className="max-w-6xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-heading mb-2">{t('payment.history')}</h1>
          <p className="text-muted">{t('payment.historyDesc')}</p>
        </div>

        {/* Filters */}
        <div className="bg-surface-elevated rounded-xl shadow-sm p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-heading flex items-center gap-2">
              <FunnelIcon className="w-5 h-5" />
              {t('common.filter')}
            </h2>
            <Button variant="secondary" onClick={() => setShowFilters(!showFilters)}
              className="text-primary-600 hover:text-primary-700">
              {showFilters ? t('common.hide') : t('common.show')}
            </Button>
          </div>

          {showFilters && (
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <label className="block text-sm font-medium text-body mb-2">{t('common.status')}</label>
                <Select
                  value={filters.status}
                  onChange={(e) => handleFilterChange('status', e.target.value)}
                >
                  <option value="">{t('common.all')}</option>
                  <option value="pending">{locale === 'en' ? 'Pending' : 'Bekliyor'}</option>
                  <option value="processing">{locale === 'en' ? 'Processing' : 'İşleniyor'}</option>
                  <option value="completed">{locale === 'en' ? 'Completed' : 'Tamamlandı'}</option>
                  <option value="failed">{locale === 'en' ? 'Failed' : 'Başarısız'}</option>
                  <option value="refunded">{locale === 'en' ? 'Refunded' : 'İade Edildi'}</option>
                </Select>
              </div>

              <div>
                <label className="block text-sm font-medium text-body mb-2">{t('payment.provider')}</label>
                <Select
                  value={filters.provider}
                  onChange={(e) => handleFilterChange('provider', e.target.value)}
                >
                  <option value="">{t('common.all')}</option>
                  <option value="paytr">PayTR</option>
                </Select>
              </div>

              <div>
                <label className="block text-sm font-medium text-body mb-2">{t('payment.startDate')}</label>
                <Input type="date"
                  value={filters.startDate}
                  onChange={(e) => handleFilterChange('startDate', e.target.value)} />
              </div>

              <div>
                <label className="block text-sm font-medium text-body mb-2">{t('payment.endDate')}</label>
                <Input type="date"
                  value={filters.endDate}
                  onChange={(e) => handleFilterChange('endDate', e.target.value)} />
              </div>
            </div>
          )}

          {showFilters && (
            <div className="mt-4 flex justify-end">
              <Button variant="secondary" onClick={clearFilters}
                className="px-4 py-2 text-muted hover:text-body">
                {t('product.clearFilters')}
              </Button>
            </div>
          )}
        </div>

        {/* Payments List */}
        <div className="bg-surface-elevated rounded-xl shadow-sm overflow-hidden">
          {payments.length === 0 ? (
            <div className="p-12 text-center">
              <CreditCardIcon className="w-16 h-16 text-subtle mx-auto mb-4" />
              <p className="text-muted text-lg">{t('payment.noHistory')}</p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-surface">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider">
                        {t('order.orderNumber')}
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider">
                        {locale === 'en' ? 'Product' : 'Ürün'}
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider">
                        {t('common.amount')}
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider">
                        {t('payment.provider')}
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider">
                        {t('common.status')}
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider">
                        {t('common.date')}
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider">
                        {t('common.actions')}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-surface-elevated divide-y divide-border">
                    {payments.map((payment) => {
                      const paymentStatusLabel = locale === 'en' ? (paymentStatusEnLabels[payment.status] || payment.status) : (paymentStatusConfig[payment.status]?.label || payment.status);

                      return (
                        <tr key={payment.id} className="hover:bg-surface">
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
                                <div className="w-12 h-12 bg-border-subtle rounded flex items-center justify-center">
                                  <CreditCardIcon className="w-6 h-6 text-subtle" />
                                </div>
                              )}
                              <div>
                                <p className="text-sm font-medium text-heading">
                                  {payment.product.title}
                                </p>
                                <p className="text-xs text-muted">
                                  {user?.id === payment.buyer.id ? (locale === 'en' ? 'Buyer' : 'Alıcı') : (locale === 'en' ? 'Seller' : 'Satıcı')}:{' '}
                                  {user?.id === payment.buyer.id
                                    ? payment.seller.displayName
                                    : payment.buyer.displayName}
                                </p>
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className="text-sm font-medium text-heading">
                              {payment.amount.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} TL
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className="text-sm text-muted uppercase">{payment.provider}</span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <StatusBadge
                              status={payment.status}
                              config={paymentStatusConfig}
                              label={paymentStatusLabel}
                            />
                            {payment.failureReason && (
                              <p className="text-xs text-danger-600 mt-1">{payment.failureReason}</p>
                            )}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-muted">
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
                                <Button variant="secondary" onClick={() => handleCancel(payment.id)}
                                  className="text-danger-600 hover:text-danger-700">
                                  {t('common.cancel')}
                                </Button>
                              )}
                              {payment.status === 'failed' && (
                                <Button variant="secondary" onClick={() => handleRetry(payment.id)}
                                  className="text-info-600 hover:text-info-700">
                                  {t('payment.retry')}
                                </Button>
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
                <div className="bg-surface px-6 py-4 flex items-center justify-between border-t border-border">
                  <div className="text-sm text-body">
                    {locale === 'en' 
                      ? `Total ${pagination.total} payments, Page ${pagination.page} / ${pagination.totalPages}`
                      : `Toplam ${pagination.total} ödeme, Sayfa ${pagination.page} / ${pagination.totalPages}`}
                  </div>
                  <div className="flex gap-2">
                    <Button variant="secondary" onClick={() => handlePageChange(pagination.page - 1)}
                      disabled={pagination.page === 1}
                      className="px-4 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-surface">
                      {t('common.previous')}
                    </Button>
                    <Button variant="secondary" onClick={() => handlePageChange(pagination.page + 1)}
                      disabled={pagination.page >= pagination.totalPages}
                      className="px-4 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-surface">
                      {t('common.next')}
                    </Button>
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
