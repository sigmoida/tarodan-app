import { api } from "./client";

/**
 * Finance domain: reports, commission config, payments & invoices, seller
 * payouts, and tax (VAT/withholding) settings.
 */
export const financeApi = {
  // Reports
  getSalesReport: (params?: {
    startDate?: string;
    endDate?: string;
    format?: string;
  }) => api.get("/admin/reports/sales", { params }),
  getCommissionReport: (params?: { startDate?: string; endDate?: string }) =>
    api.get("/admin/reports/commission", { params }),
  getUserReport: (params?: any) => api.get("/admin/reports/users", { params }),
  getTradeReport: (params?: any) =>
    api.get("/admin/reports/trades", { params }),
  getProductReport: (params?: any) =>
    api.get("/admin/reports/products", { params }),
  exportReport: (type: string, format: string, params?: any) =>
    api.get(`/admin/reports/${type}`, {
      params: { ...params, format },
      responseType: "json",
    }),

  // Commission
  getCommissionRevenue: (params?: { fromDate?: string; toDate?: string }) =>
    api.get("/admin/commission/revenue", { params }),
  getCommissionRules: () => api.get("/admin/commission-rules"),
  createCommissionRule: (data: any) =>
    api.post("/admin/commission-rules", data),
  updateCommissionRule: (id: string, data: any) =>
    api.patch(`/admin/commission-rules/${id}`, data),
  deleteCommissionRule: (id: string) =>
    api.delete(`/admin/commission-rules/${id}`),
  getTradeCommissionRate: () => api.get("/admin/trade-commission-rate"),
  setTradeCommissionRate: (rate: number) =>
    api.patch("/admin/trade-commission-rate", { rate }),

  // Payments
  getPayments: (params?: {
    status?: string;
    provider?: string;
    startDate?: string;
    endDate?: string;
    search?: string;
    page?: number;
    limit?: number;
    sortBy?: string;
    sortOrder?: "asc" | "desc";
  }) => api.get("/admin/payments", { params }),
  getPayment: (id: string) => api.get(`/admin/payments/${id}`),
  // Invoices (e-Archive/e-Invoice) — issued + refund documents
  getInvoices: (params?: {
    type?: string;
    status?: string;
    documentType?: string;
    search?: string;
    startDate?: string;
    endDate?: string;
    page?: number;
    limit?: number;
    sortBy?: string;
    sortOrder?: "asc" | "desc";
  }) => api.get("/admin/invoices", { params }),
  getInvoicePdf: (id: string) => api.get(`/admin/invoices/${id}/pdf`),
  // Product invoices manually uploaded by corporate sellers (separate tab)
  getSellerInvoices: (params?: {
    search?: string;
    startDate?: string;
    endDate?: string;
    page?: number;
    limit?: number;
    sortBy?: string;
    sortOrder?: "asc" | "desc";
  }) => api.get("/admin/seller-invoices", { params }),
  getSellerInvoicePdf: (id: string) =>
    api.get(`/admin/seller-invoices/${id}/pdf`),
  getPaymentStatistics: (params?: {
    period?: "daily" | "weekly" | "monthly";
    startDate?: string;
    endDate?: string;
  }) => api.get("/admin/payments/statistics", { params }),
  getFailedPayments: (params?: {
    provider?: string;
    startDate?: string;
    endDate?: string;
    search?: string;
    page?: number;
    limit?: number;
    sortBy?: string;
    sortOrder?: "asc" | "desc";
  }) => api.get("/admin/payments/failed", { params }),
  manualRefund: (id: string, data: { amount?: number; reason?: string }) =>
    api.post(`/admin/payments/${id}/manual-refund`, data),
  forceCancelPayment: (id: string, reason: string) =>
    api.post(`/admin/payments/${id}/force-cancel`, { reason }),

  // Seller Payouts
  getPayoutsSummary: () => api.get("/admin/payouts/summary"),
  getPayoutsTransactions: (params?: {
    search?: string;
    sellerId?: string;
    status?: string;
    dateFrom?: string;
    dateTo?: string;
    page?: number;
    limit?: number;
    sortBy?: string;
    sortOrder?: "asc" | "desc";
  }) => api.get("/admin/payouts/transactions", { params }),
  getPayoutsSchedule: (params?: { sellerId?: string; limit?: number }) =>
    api.get("/admin/payouts/schedule", { params }),
  getPayoutsExport: (params?: {
    sellerId?: string;
    status?: string;
    dateFrom?: string;
    dateTo?: string;
  }) => api.get("/admin/payouts/export", { params }),
  releasePayout: (orderId: string) =>
    api.post(`/admin/payouts/release/${orderId}`),

  // Tax Settings — simple VAT config (the old region/rate/rule CRUD was removed
  // from the UI; the backend endpoints remain, the UI uses the tax/vat surface)
  getVatConfig: () => api.get("/admin/tax/vat"),
  setDefaultVat: (rate: number) => api.patch("/admin/tax/vat", { rate }),
  setVatOverride: (categoryId: string, rate: number) =>
    api.put("/admin/tax/vat/override", { categoryId, rate }),
  deleteVatOverride: (id: string) =>
    api.delete(`/admin/tax/vat/override/${id}`),
  getTaxReport: (params?: {
    fromDate?: string;
    toDate?: string;
    groupBy?: string;
  }) => api.get("/admin/tax/report", { params }),
  getWithholdingRate: () => api.get("/admin/tax/withholding"),
  setWithholdingRate: (rate: number) =>
    api.patch("/admin/tax/withholding", { rate }),
  getWithholdingReport: (params: { year: number; month: number }) =>
    api.get("/admin/tax/withholding-report", { params }),
};
