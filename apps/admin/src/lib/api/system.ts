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

  // Membership Tiers
  getMembershipTiers: () => api.get("/admin/membership-tiers"),
  updateMembershipTier: (id: string, data: any) =>
    api.patch(`/admin/membership-tiers/${id}`, data),

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
  }) => api.get("/user-reports/admin", { params }),
  getUserReportStats: () => api.get("/user-reports/admin/stats"),
  getUserReportById: (id: string) => api.get(`/user-reports/admin/${id}`),
};
