import type { DashboardPeriodQuery } from "@tarodan/types";
import { api } from "./client";

/** Dashboard widgets + analytics charts. */
export const dashboardApi = {
  // Dashboard
  /** Stat cards for one period; every metric also carries its all-time figure. */
  getDashboard: (params?: DashboardPeriodQuery) =>
    api.get("/admin/dashboard", { params }),
  getRecentOrders: (limit?: number) =>
    api.get("/admin/dashboard/recent-orders", { params: { limit } }),
  /** Zone A + B — action queues and alerts; never date-filtered. */
  getDashboardWorklist: () => api.get("/admin/dashboard/worklist"),
  /** Zone D — escrow, seller debt, active listings/memberships/boosts. */
  getDashboardStock: () => api.get("/admin/dashboard/stock"),
  /** Drops the server-side dashboard caches so the next read recomputes. */
  refreshDashboard: () => api.post("/admin/dashboard/refresh"),
  getTopProducts: (limit?: number) =>
    api.get("/admin/dashboard/top-products", { params: { limit } }),
  getTopSellers: (limit?: number) =>
    api.get("/admin/dashboard/top-sellers", { params: { limit } }),

  // Analytics
  getSalesAnalytics: (params?: {
    startDate?: string;
    endDate?: string;
    groupBy?: string;
  }) => api.get("/admin/analytics/sales", { params }),
  getRevenueAnalytics: (params?: {
    startDate?: string;
    endDate?: string;
    groupBy?: string;
  }) => api.get("/admin/analytics/revenue", { params }),
  getUserAnalytics: (params?: {
    startDate?: string;
    endDate?: string;
    groupBy?: string;
  }) => api.get("/admin/analytics/users", { params }),
};
