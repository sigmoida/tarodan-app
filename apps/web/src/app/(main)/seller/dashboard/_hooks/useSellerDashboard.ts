/** @format */

"use client";

import { api } from "@/lib/api";
import { useWebList } from "@/hooks/useWebResource";

const PENDING_ORDER_STATUSES = ["paid", "preparing"];

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

  const sellerOrdersQuery = useWebList<Array<{ status: string }>>({
    resource: "orders",
    fetcher: async () => {
      const res = await api.get("/orders", { params: { role: "seller" } });
      return res.data?.orders ?? res.data?.data ?? [];
    },
  });

  const stats = statsQuery.data;
  const listingStats = listingStatsQuery.data;
  const orders: Array<{ status: string }> = sellerOrdersQuery.data ?? [];

  return {
    totalRevenue: Number(stats?.totalRevenue ?? 0),
    activeCount:
      listingStats?.counts?.active ?? stats?.activeProductsCount ?? 0,
    soldCount: listingStats?.counts?.sold ?? stats?.soldProductsCount ?? 0,
    pendingCount: orders.filter((o) =>
      PENDING_ORDER_STATUSES.includes(o.status),
    ).length,
    isLoading: statsQuery.isLoading || listingStatsQuery.isLoading,
  };
}
