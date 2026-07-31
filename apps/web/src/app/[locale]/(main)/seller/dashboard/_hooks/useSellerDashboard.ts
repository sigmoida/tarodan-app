/** @format */

"use client";

import { api } from "@/lib/api";
import { useWebList } from "@/hooks/useWebResource";

/** Seller dashboard metrics: revenue + listing counts + pending order count.
 *  Auth is already enforced by the server page, so the queries just run. */
export function useSellerDashboard() {
  const statsQuery = useWebList<any>({
    resource: "users",
    fetcher: async () =>
      (await api.get("/users/me/stats").catch(() => null))?.data ?? null,
  });

  const listingStatsQuery = useWebList<any>({
    resource: "products",
    fetcher: async () =>
      (await api.get("/products/my/stats").catch(() => null))?.data ?? null,
  });

  // Bekleyen sayacı sunucudan, PAKET çatısı biriminde — eski sayaç order-bazlıydı
  // ve yalnız ilk sayfayı sayıyordu (satış listesiyle asla tutmuyordu).
  const pendingQuery = useWebList<{ pending: number }>({
    resource: "orders",
    params: ["seller-pending"],
    fetcher: async () => {
      const res = await api.get("/orders/seller/pending-count");
      return res.data;
    },
  });

  const stats = statsQuery.data;
  const listingStats = listingStatsQuery.data;

  return {
    totalRevenue: Number(stats?.totalRevenue ?? 0),
    activeCount:
      listingStats?.counts?.active ?? stats?.activeProductsCount ?? 0,
    soldCount: listingStats?.counts?.sold ?? stats?.soldProductsCount ?? 0,
    pendingCount: pendingQuery.data?.pending ?? 0,
    isLoading: statsQuery.isLoading || listingStatsQuery.isLoading,
  };
}
