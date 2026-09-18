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
  getPendingActions: () => api.get("/admin/dashboard/pending-actions"),
  getIdentityVerificationRequests: () =>
    api.get("/admin/users/verification-requests"),
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
