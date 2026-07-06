'use client';

import { useEffect, useState } from 'react';
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

const PENDING_ORDER_STATUSES = ['paid', 'preparing'];

export default function SellerDashboardPage() {
  const router = useRouter();
  const { t } = useTranslation();
  const { isAuthenticated, isLoading: authLoading } = useAuthStore();

  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    if (!mounted || authLoading) return;
    if (!isAuthenticated) {
      router.push('/login?redirect=/seller/dashboard');
    }
  }, [mounted, isAuthenticated, authLoading, router]);

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

  const isLoading = !mounted || authLoading || !isAuthenticated || statsQuery.isLoading || listingStatsQuery.isLoading;

  return (
    <div className="min-h-screen bg-surface">
      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-heading">
            {t('sellerDashboard.title')}
          </h1>
          <p className="text-muted mt-1">
            {t('sellerDashboard.subtitle')}
          </p>
        </div>

        {isLoading ? (
          <div className="animate-pulse space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-28 bg-border-subtle rounded-xl" />
              ))}
            </div>
            <div className="h-40 bg-border-subtle rounded-xl" />
          </div>
        ) : (
          <>
            {/* Satış özeti */}
            <section className="mb-8">
              <h2 className="text-lg font-semibold text-heading mb-4">
                {t('sellerDashboard.salesOverview')}
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-surface-elevated rounded-xl shadow-sm border border-border-subtle p-5"
                >
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-success-100 rounded-lg">
                      <CurrencyDollarIcon className="w-6 h-6 text-success-600" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-heading">
                        {Number(totalRevenue).toLocaleString('tr-TR', {
                          maximumFractionDigits: 0,
                        })}{' '}
                        TL
                      </p>
                      <p className="text-sm text-muted">
                        {t('sellerDashboard.totalRevenue')}
                      </p>
                    </div>
                  </div>
                </motion.div>
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.05 }}
                  className="bg-surface-elevated rounded-xl shadow-sm border border-border-subtle p-5"
                >
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-info-100 rounded-lg">
                      <ShoppingBagIcon className="w-6 h-6 text-info-600" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-heading">
                        {activeCount}
                      </p>
                      <p className="text-sm text-muted">
                        {t('sellerDashboard.activeListings')}
                      </p>
                    </div>
                  </div>
                </motion.div>
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 }}
                  className="bg-surface-elevated rounded-xl shadow-sm border border-border-subtle p-5"
                >
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-primary-100 rounded-lg">
                      <ArrowTrendingUpIcon className="w-6 h-6 text-primary-600" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-heading">
                        {soldCount}
                      </p>
                      <p className="text-sm text-muted">
                        {t('sellerDashboard.soldItems')}
                      </p>
                    </div>
                  </div>
                </motion.div>
              </div>
            </section>

            {/* Bekleyen siparişler */}
            <section className="mb-8">
              <h2 className="text-lg font-semibold text-heading mb-4">
                {t('sellerDashboard.pendingOrders')}
              </h2>
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15 }}
              >
                <Link
                  href="/profile/orders?filter=seller"
                  className="block bg-surface-elevated rounded-xl shadow-sm border border-border-subtle p-5 hover:border-primary-200 hover:shadow-md transition-all"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-warning-100 rounded-lg">
                        <ClipboardDocumentListIcon className="w-6 h-6 text-warning-600" />
                      </div>
                      <div>
                        <p className="font-semibold text-heading">
                          {pendingCount === 0
                            ? t('sellerDashboard.noPendingOrders')
                            : t('sellerDashboard.pendingOrdersCount', { count: pendingCount })}
                        </p>
                        <p className="text-sm text-muted">
                          {t('sellerDashboard.viewAllOrders')}
                        </p>
                      </div>
                    </div>
                    <ArrowRightIcon className="w-5 h-5 text-subtle" />
                  </div>
                </Link>
              </motion.div>
            </section>

            {/* Hızlı aksiyonlar */}
            <section>
              <h2 className="text-lg font-semibold text-heading mb-4">
                {t('sellerDashboard.quickActions')}
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <Link
                  href="/listings/new"
                  className="flex items-center gap-3 bg-surface-elevated rounded-xl shadow-sm border border-border-subtle p-4 hover:border-primary-300 hover:shadow-md transition-all group"
                >
                  <div className="p-2 bg-primary-100 rounded-lg group-hover:bg-primary-200">
                    <PlusIcon className="w-5 h-5 text-primary-600" />
                  </div>
                  <span className="font-medium text-heading">
                    {t('sellerDashboard.newListing')}
                  </span>
                </Link>
                <Link
                  href="/profile/orders?filter=seller"
                  className="flex items-center gap-3 bg-surface-elevated rounded-xl shadow-sm border border-border-subtle p-4 hover:border-primary-300 hover:shadow-md transition-all group"
                >
                  <div className="p-2 bg-info-100 rounded-lg group-hover:bg-info-200">
                    <ClipboardDocumentListIcon className="w-5 h-5 text-info-600" />
                  </div>
                  <span className="font-medium text-heading">
                    {t('sellerDashboard.myOrders')}
                  </span>
                </Link>
                <Link
                  href="/profile/listings"
                  className="flex items-center gap-3 bg-surface-elevated rounded-xl shadow-sm border border-border-subtle p-4 hover:border-primary-300 hover:shadow-md transition-all group"
                >
                  <div className="p-2 bg-success-100 rounded-lg group-hover:bg-success-200">
                    <TagIcon className="w-5 h-5 text-success-600" />
                  </div>
                  <span className="font-medium text-heading">
                    {t('sellerDashboard.myListings')}
                  </span>
                </Link>
                <Link
                  href="/profile/analytics"
                  className="flex items-center gap-3 bg-surface-elevated rounded-xl shadow-sm border border-border-subtle p-4 hover:border-primary-300 hover:shadow-md transition-all group"
                >
                  <div className="p-2 bg-primary-100 rounded-lg group-hover:bg-primary-200">
                    <ChartBarIcon className="w-5 h-5 text-primary-600" />
                  </div>
                  <span className="font-medium text-heading">
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
