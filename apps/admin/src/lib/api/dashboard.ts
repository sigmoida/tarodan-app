import type {
  AnalyticsExportFormat,
  AnalyticsRangeQuery,
  AnalyticsTab,
  DashboardPeriodQuery,
} from "@tarodan/types";
import { api } from "./client";

/** Dashboard widgets + the analytics screen's per-tab endpoints. */
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

  // Analytics — ONE request per tab, over the shared range contract.
  /** The active tab's figures for the selected window. */
  getAnalyticsTab: (tab: AnalyticsTab, params: AnalyticsRangeQuery) =>
    api.get(`/admin/analytics/${tab}`, { params }),
  /**
   * The same tab, same window, as a file. The API renders it FROM the response
   * the screen is showing, so the two cannot disagree — and it arrives as a
   * blob, not as JSON to be re-assembled in the browser.
   */
  exportAnalyticsTab: (
    tab: AnalyticsTab,
    format: AnalyticsExportFormat,
    params: AnalyticsRangeQuery,
  ) =>
    api.get(`/admin/analytics/${tab}/export`, {
      params: { ...params, format },
      responseType: "blob",
    }),
};
