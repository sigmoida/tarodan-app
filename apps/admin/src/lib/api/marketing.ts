import { api } from "./client";

/** Marketing domain: static pages, email templates, ads, and notifications. */
export const marketingApi = {
  // Static Pages
  getPages: () => api.get("/admin/pages"),
  getPageById: (id: string) => api.get(`/admin/pages/${id}`),
  getPageBySlug: (slug: string) => api.get(`/admin/pages/slug/${slug}`),
  createPage: (data: any) => api.post("/admin/pages", data),
  updatePage: (id: string, data: any) => api.patch(`/admin/pages/${id}`, data),
  deletePage: (id: string) => api.delete(`/admin/pages/${id}`),

  // Email Templates
  getEmailTemplates: () => api.get("/admin/email-templates"),
  getEmailTemplate: (key: string) =>
    api.get(`/admin/email-templates/${encodeURIComponent(key)}`),
  updateEmailTemplate: (key: string, data: any) =>
    api.patch(`/admin/email-templates/${encodeURIComponent(key)}`, data),
  previewEmailTemplate: (
    key: string,
    templateData?: Record<string, any>,
    draft?: { html?: string; subject?: string },
  ) =>
    api.post(`/admin/email-templates/${encodeURIComponent(key)}/preview`, {
      templateData,
      ...(draft?.html !== undefined && { overrideHtml: draft.html }),
      ...(draft?.subject !== undefined && { overrideSubject: draft.subject }),
    }),
  resetEmailTemplate: (key: string) =>
    api.delete(`/admin/email-templates/${encodeURIComponent(key)}`),
  sendTestEmail: (
    key: string,
    data: { to: string; templateData?: Record<string, any> },
  ) =>
    api.post(
      `/admin/email-templates/${encodeURIComponent(key)}/send-test`,
      data,
    ),

  // Advertisements
  getAds: () => api.get("/admin/ads"),
  createAd: (data: any) => api.post("/admin/ads", data),
  updateAd: (id: string, data: any) => api.patch(`/admin/ads/${id}`, data),
  deleteAd: (id: string) => api.delete(`/admin/ads/${id}`),
  reorderAds: (ids: string[]) => api.patch("/admin/ads/reorder", { ids }),

  // Notifications
  getNotificationHistory: (params?: {
    page?: number;
    limit?: number;
    channel?: string;
    status?: string;
    userId?: string;
    type?: string;
    search?: string;
    startDate?: string;
    endDate?: string;
    sortBy?: string;
    sortOrder?: "asc" | "desc";
  }) => api.get("/admin/notifications/history", { params }),
  sendNotification: (data: {
    title: string;
    body: string;
    channels: string[];
    targetType: "all" | "segment" | "user_ids";
    userIds?: string[];
    segmentCriteria?: Record<string, any>;
    data?: Record<string, any>;
  }) => api.post("/admin/notifications/send", data),
  scheduleNotification: (data: {
    title: string;
    body: string;
    channels: string[];
    targetType: "all" | "segment" | "user_ids";
    userIds?: string[];
    segmentCriteria?: Record<string, any>;
    scheduledFor: string;
  }) => api.post("/admin/notifications/schedule", data),
  getScheduledNotifications: (params?: {
    page?: number;
    limit?: number;
    status?: string;
    sortBy?: string;
    sortOrder?: "asc" | "desc";
  }) => api.get("/admin/notifications/scheduled", { params }),
  cancelScheduledNotification: (id: string) =>
    api.delete(`/admin/notifications/scheduled/${id}`),
};
