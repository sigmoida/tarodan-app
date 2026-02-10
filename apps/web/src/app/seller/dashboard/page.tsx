'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  ChartBarIcon,
  ShoppingBagIcon,
  TagIcon,
  CurrencyDollarIcon,
  ArrowTrendingUpIcon,
  PlusIcon,
  ClipboardDocumentListIcon,
  ArrowRightIcon,
} from '@heroicons/react/24/outline';
import { useAuthStore } from '@/stores/authStore';
import { api } from '@/lib/api';
import { useTranslation } from '@/i18n';
import AuthLoadingScreen from '@/components/AuthLoadingScreen';

const PENDING_ORDER_STATUSES = ['paid', 'preparing'];

export default function SellerDashboardPage() {
  const router = useRouter();
  const { t } = useTranslation();
  const { isAuthenticated, isLoading: authLoading } = useAuthStore();

  useEffect(() => {
    if (authLoading) return;
    if (!isAuthenticated) {
      router.push('/login?redirect=/seller/dashboard');
    }
  }, [isAuthenticated, authLoading, router]);

  const statsQuery = useQuery({
    queryKey: ['users', 'me', 'stats'],
    queryFn: async () => {
      const res = await api.get('/users/me/stats').catch(() => null);
      return res?.data ?? null;
    },
    enabled: !authLoading && isAuthenticated,
  });

  const listingStatsQuery = useQuery({
    queryKey: ['products', 'my', 'stats'],
    queryFn: async () => {
      const res = await api.get('/products/my/stats').catch(() => null);
      return res?.data ?? null;
    },
    enabled: !authLoading && isAuthenticated,
  });

  const sellerOrdersQuery = useQuery({
    queryKey: ['orders', 'seller'],
    queryFn: async () => {
      const res = await api.get('/orders', { params: { role: 'seller' } });
      return res.data?.orders ?? res.data?.data ?? [];
    },
    enabled: !authLoading && isAuthenticated,
  });

  const stats = statsQuery.data;
  const listingStats = listingStatsQuery.data;
  const orders = sellerOrdersQuery.data ?? [];
  const pendingOrders = orders.filter((o: { status: string }) =>
    PENDING_ORDER_STATUSES.includes(o.status)
  );
  const pendingCount = pendingOrders.length;
  const activeCount = listingStats?.counts?.active ?? stats?.activeProductsCount ?? 0;
  const soldCount = listingStats?.counts?.sold ?? stats?.soldProductsCount ?? 0;
  const totalRevenue = stats?.totalRevenue ?? 0;

  if (authLoading) return <AuthLoadingScreen />;
  if (!isAuthenticated) return null;

  const isLoading = statsQuery.isLoading || listingStatsQuery.isLoading;

  return (
    <div className="min-h-screen bg-gray-50">
      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">
            {t('sellerDashboard.title')}
          </h1>
          <p className="text-gray-600 mt-1">
            {t('sellerDashboard.subtitle')}
          </p>
        </div>

        {isLoading ? (
          <div className="animate-pulse space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-28 bg-gray-200 rounded-xl" />
              ))}
            </div>
            <div className="h-40 bg-gray-200 rounded-xl" />
          </div>
        ) : (
          <>
            {/* Satış özeti */}
            <section className="mb-8">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">
                {t('sellerDashboard.salesOverview')}
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-white rounded-xl shadow-sm border border-gray-100 p-5"
                >
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-green-100 rounded-lg">
                      <CurrencyDollarIcon className="w-6 h-6 text-green-600" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-gray-900">
                        {Number(totalRevenue).toLocaleString('tr-TR', {
                          maximumFractionDigits: 0,
                        })}{' '}
                        TL
                      </p>
                      <p className="text-sm text-gray-500">
                        {t('sellerDashboard.totalRevenue')}
                      </p>
                    </div>
                  </div>
                </motion.div>
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.05 }}
                  className="bg-white rounded-xl shadow-sm border border-gray-100 p-5"
                >
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-blue-100 rounded-lg">
                      <ShoppingBagIcon className="w-6 h-6 text-blue-600" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-gray-900">
                        {activeCount}
                      </p>
                      <p className="text-sm text-gray-500">
                        {t('sellerDashboard.activeListings')}
                      </p>
                    </div>
                  </div>
                </motion.div>
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 }}
                  className="bg-white rounded-xl shadow-sm border border-gray-100 p-5"
                >
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-orange-100 rounded-lg">
                      <ArrowTrendingUpIcon className="w-6 h-6 text-orange-600" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-gray-900">
                        {soldCount}
                      </p>
                      <p className="text-sm text-gray-500">
                        {t('sellerDashboard.soldItems')}
                      </p>
                    </div>
                  </div>
                </motion.div>
              </div>
            </section>

            {/* Bekleyen siparişler */}
            <section className="mb-8">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">
                {t('sellerDashboard.pendingOrders')}
              </h2>
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15 }}
              >
                <Link
                  href="/orders?filter=seller"
                  className="block bg-white rounded-xl shadow-sm border border-gray-100 p-5 hover:border-orange-200 hover:shadow-md transition-all"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-amber-100 rounded-lg">
                        <ClipboardDocumentListIcon className="w-6 h-6 text-amber-600" />
                      </div>
                      <div>
                        <p className="font-semibold text-gray-900">
                          {pendingCount === 0
                            ? t('sellerDashboard.noPendingOrders')
                            : t('sellerDashboard.pendingOrdersCount', { count: pendingCount })}
                        </p>
                        <p className="text-sm text-gray-500">
                          {t('sellerDashboard.viewAllOrders')}
                        </p>
                      </div>
                    </div>
                    <ArrowRightIcon className="w-5 h-5 text-gray-400" />
                  </div>
                </Link>
              </motion.div>
            </section>

            {/* Hızlı aksiyonlar */}
            <section>
              <h2 className="text-lg font-semibold text-gray-900 mb-4">
                {t('sellerDashboard.quickActions')}
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <Link
                  href="/listings/new"
                  className="flex items-center gap-3 bg-white rounded-xl shadow-sm border border-gray-100 p-4 hover:border-orange-300 hover:shadow-md transition-all group"
                >
                  <div className="p-2 bg-orange-100 rounded-lg group-hover:bg-orange-200">
                    <PlusIcon className="w-5 h-5 text-orange-600" />
                  </div>
                  <span className="font-medium text-gray-900">
                    {t('sellerDashboard.newListing')}
                  </span>
                </Link>
                <Link
                  href="/orders?filter=seller"
                  className="flex items-center gap-3 bg-white rounded-xl shadow-sm border border-gray-100 p-4 hover:border-orange-300 hover:shadow-md transition-all group"
                >
                  <div className="p-2 bg-blue-100 rounded-lg group-hover:bg-blue-200">
                    <ClipboardDocumentListIcon className="w-5 h-5 text-blue-600" />
                  </div>
                  <span className="font-medium text-gray-900">
                    {t('sellerDashboard.myOrders')}
                  </span>
                </Link>
                <Link
                  href="/profile/listings"
                  className="flex items-center gap-3 bg-white rounded-xl shadow-sm border border-gray-100 p-4 hover:border-orange-300 hover:shadow-md transition-all group"
                >
                  <div className="p-2 bg-green-100 rounded-lg group-hover:bg-green-200">
                    <TagIcon className="w-5 h-5 text-green-600" />
                  </div>
                  <span className="font-medium text-gray-900">
                    {t('sellerDashboard.myListings')}
                  </span>
                </Link>
                <Link
                  href="/analytics"
                  className="flex items-center gap-3 bg-white rounded-xl shadow-sm border border-gray-100 p-4 hover:border-orange-300 hover:shadow-md transition-all group"
                >
                  <div className="p-2 bg-purple-100 rounded-lg group-hover:bg-purple-200">
                    <ChartBarIcon className="w-5 h-5 text-purple-600" />
                  </div>
                  <span className="font-medium text-gray-900">
                    {t('sellerDashboard.analytics')}
                  </span>
                </Link>
              </div>
            </section>
          </>
        )}
      </main>
    </div>
  );
}
