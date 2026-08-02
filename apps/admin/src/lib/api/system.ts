import { api } from "./client";

/**
 * System domain: global settings, membership tiers, audit/error/security logs,
 * support tickets, and user content reports (complaints).
 */
export const systemApi = {
  // Settings
  getSettings: () => api.get("/admin/settings"),
  updateSettings: (data: any) => api.patch("/admin/settings", data),
  updateSetting: (key: string, value: string) =>
    api.patch(`/admin/settings/${key}`, { value }),

  // Early-access invite codes (pre-launch site lock)
  getSiteAccessPins: (params?: any) =>
    api.get("/admin/site-access-pins", { params }),
  createSiteAccessPin: (data: any) => api.post("/admin/site-access-pins", data),
  updateSiteAccessPin: (id: string, data: any) =>
    api.patch(`/admin/site-access-pins/${id}`, data),
  deleteSiteAccessPin: (id: string) =>
    api.delete(`/admin/site-access-pins/${id}`),
  sendSiteAccessPinInvite: (id: string) =>
    api.post(`/admin/site-access-pins/${id}/send-invite`),

  // Safe-trade warehouse address (backed by the warehouse_address_id setting)
  getWarehouseAddress: () => api.get("/admin/settings/warehouse-address"),
  updateWarehouseAddress: (data: {
    title?: string;
    fullName: string;
    phone: string;
    city: string;
    district: string;
    address: string;
    zipCode?: string;
  }) => api.put("/admin/settings/warehouse-address", data),

  // Search index (Elasticsearch) — drops + rebuilds the product index.
  reindexSearch: () => api.post("/search/admin/reindex"),

  // Membership Tiers
  getMembershipTiers: () => api.get("/admin/membership-tiers"),
  updateMembershipTier: (id: string, data: any) =>
    api.patch(`/admin/membership-tiers/${id}`, data),

  // Shipping Tariffs (typed shipping pricing)
  getShippingTariffs: (provider?: string) =>
    api.get("/admin/shipping/tariffs", {
      params: provider ? { provider } : {},
    }),
  createShippingTariff: (data: any) =>
    api.post("/admin/shipping/tariffs", data),
  updateShippingTariff: (id: string, data: any) =>
    api.patch(`/admin/shipping/tariffs/${id}`, data),
  activateShippingTariff: (id: string) =>
    api.post(`/admin/shipping/tariffs/${id}/activate`),
  /** Aktif tarifeyi paket boyutlarıyla yeni bir taslağa kopyalar. */
  cloneActiveShippingTariff: (provider?: string) =>
    api.post("/admin/shipping/tariffs/clone-active", undefined, {
      params: provider ? { provider } : {},
    }),

  // Audit Logs
  getAuditLogs: (params?: any) => api.get("/admin/audit-logs", { params }),

  // Logs
  getErrorLogs: (params?: any) => api.get("/admin/logs/errors", { params }),
  getSecurityLogs: (params?: any) =>
    api.get("/admin/logs/security", { params }),
  getEmailLogs: (params?: any) => api.get("/admin/logs/emails", { params }),
  resolveSecurityIssue: (id: string, notes?: string) =>
    api.patch(`/admin/logs/security/${id}/resolve`, { notes }),
  blockIP: (data: { ipAddress: string; reason?: string }) =>
    api.post("/admin/logs/security/block-ip", data),

  // Support Tickets
  getTickets: (params?: any) => api.get("/support/admin/tickets", { params }),
  getTicket: (id: string) => api.get(`/support/admin/tickets/${id}`),
  updateTicketStatus: (id: string, status: string, note?: string) =>
    api.patch(`/support/admin/tickets/${id}/status`, {
      status,
      ...(note ? { note } : {}),
    }),
  replyToTicket: (id: string, content: string, isInternal = false) =>
    api.post(`/support/admin/tickets/${id}/messages`, { content, isInternal }),
  getGuestContacts: (params?: {
    page?: number;
    limit?: number;
    search?: string;
    sortBy?: string;
    sortOrder?: "asc" | "desc";
  }) => api.get("/support/admin/guest-contacts", { params: params ?? {} }),

  // User complaints (content reports)
  getUserReports: (params?: {
    status?: string;
    type?: string;
    page?: number;
    limit?: number;
    search?: string;
    sortBy?: string;
    sortOrder?: "asc" | "desc";
    startDate?: string;
    endDate?: string;
  }) => api.get("/user-reports/admin", { params }),
  getUserReportStats: () => api.get("/user-reports/admin/stats"),
  getUserReportById: (id: string) => api.get(`/user-reports/admin/${id}`),

  // Medya tarayıcısı (Faz 3): bucket klasörleri + dosya sahipliği (read-only)
  getMediaBrowse: (prefix = "") =>
    api.get("/admin/media/browse", { params: { prefix } }),

  // AI moderasyon — eşikler 0..1 ORANI olarak taşınır (panel % ile gösterir).
  getAiModerationConfig: () =>
    api.get<{
      enabled: boolean;
      relevanceThreshold: number;
      nsfwThreshold: number;
    }>("/admin/moderation/ai-config"),
  setAiModerationConfig: (body: {
    relevanceThreshold: number;
    nsfwThreshold: number;
  }) => api.post("/admin/moderation/ai-config", body),
  testModerationImage: (imageUrl: string) =>
    api.post("/admin/moderation/test-image", { imageUrl }),
};
