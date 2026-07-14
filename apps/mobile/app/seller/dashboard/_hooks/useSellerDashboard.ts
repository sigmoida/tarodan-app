import { useQuery } from '@tanstack/react-query';
import { userApi, ordersApi, productsApi } from '@/lib/api';
import { useAuthStore } from '@/stores/authStore';
import type { SellerStats } from '../_lib/types';

/**
 * Seller dashboard controller — owns the 3 stat queries (product stats +
 * analytics + optional business-stats merge, pending-orders count, active-
 * listings count), derived values and refresh. Lifted verbatim (§12).
 */
export function useSellerDashboard() {
  const { user, isAuthenticated } = useAuthStore();
  const isBusiness = user?.membershipTier === 'business';

  // İşletme olmayan satıcılarda /users/me/business-stats 400 döndüğü için panel boş kalıyordu.
  // Web seller dashboard gibi genel veriyi non-business uçlardan çek:
  // - /products/my/stats (counts.active/sold/total)
  // - /users/me/analytics (totalSales/totalRevenue/pendingOrders)
  // business-stats yalnızca isBusiness olduğunda EK olarak istenir.
  const statsQuery = useQuery<SellerStats>({
    queryKey: ['seller-stats', isBusiness],
    queryFn: async () => {
      const [productStatsRes, analyticsRes, businessStatsRes] = await Promise.allSettled([
        productsApi.getMyStats(),
        userApi.getAnalytics(),
        isBusiness ? userApi.getStats() : Promise.resolve(null),
      ]);

      const productStats =
        productStatsRes.status === 'fulfilled'
          ? productStatsRes.value.data?.data ?? productStatsRes.value.data ?? {}
          : {};
      const counts = productStats?.counts ?? {};

      const analytics =
        analyticsRes.status === 'fulfilled'
          ? analyticsRes.value.data?.data ?? analyticsRes.value.data ?? {}
          : {};

      const businessStats =
        businessStatsRes.status === 'fulfilled' && businessStatsRes.value
          ? (businessStatsRes.value as any).data?.data ?? (businessStatsRes.value as any).data ?? {}
          : {};

      // business-stats varsa onu temel al, eksik/non-business alanları genel uçlardan tamamla.
      return {
        ...businessStats,
        activeListings: counts.active ?? businessStats.activeListings,
        soldListings: counts.sold ?? businessStats.soldListings,
        totalListings: counts.total ?? businessStats.totalListings,
        pendingOrders: analytics.pendingOrders ?? businessStats.pendingOrders,
        monthlySales: businessStats.monthlySales ?? analytics.totalRevenue,
        totalSales: businessStats.totalSales ?? analytics.totalRevenue,
        totalOrders: businessStats.totalOrders ?? analytics.totalSales,
      };
    },
    enabled: isAuthenticated,
  });

  const pendingOrdersQuery = useQuery({
    queryKey: ['seller-pending-orders'],
    queryFn: async () => {
      const response = await ordersApi.getAll({ role: 'seller', status: 'paid' });
      const payload = response.data?.data ?? response.data ?? [];
      return Array.isArray(payload) ? payload.length : 0;
    },
    enabled: isAuthenticated,
  });

  const myListingsQuery = useQuery({
    queryKey: ['seller-my-listings-count'],
    queryFn: async () => {
      const response = await productsApi.getMyListings({ status: 'active' });
      const payload = response.data?.data ?? response.data ?? [];
      return Array.isArray(payload) ? payload.length : payload?.total ?? 0;
    },
    enabled: isAuthenticated,
  });

  const isLoading =
    statsQuery.isLoading && pendingOrdersQuery.isLoading && myListingsQuery.isLoading;

  const stats = statsQuery.data ?? {};
  const activeListings = myListingsQuery.data ?? stats.activeListings ?? 0;
  const pendingOrders = pendingOrdersQuery.data ?? stats.pendingOrders ?? 0;
  const monthly = stats.monthlySales ?? 0;
  const rating = stats.averageRating ?? 0;

  const refresh = () => {
    statsQuery.refetch();
    pendingOrdersQuery.refetch();
    myListingsQuery.refetch();
  };

  return {
    user,
    isAuthenticated,
    isBusiness,
    isLoading,
    isRefetching: statsQuery.isRefetching,
    stats,
    activeListings,
    pendingOrders,
    monthly,
    rating,
    refresh,
  };
}

export type SellerDashboardController = ReturnType<typeof useSellerDashboard>;
