import { api } from "./client";
import type {
  BroadcastEmailPreviewPayload,
  NotificationBroadcastPayload,
} from "./marketing.types";

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
    data: {
      to: string;
      templateData?: Record<string, any>;
      overrideHtml?: string;
      overrideSubject?: string;
    },
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
  /** Reklam görseli yükleme (multipart); yanıt `/admin/media/upload` ile aynı: `{ url, key }`. */
  uploadAdImage: (file: File) => {
    const formData = new FormData();
    formData.append("file", file);
    return api.post<{ url: string; key: string }>(
      "/admin/ads/upload",
      formData,
      { headers: { "Content-Type": "multipart/form-data" } },
    );
  },
  /** Kampanya (indirim) listesi; reklam formundaki kampanya seçimi için. */
  getDiscounts: (params?: { isActive?: boolean; limit?: number }) =>
    api.get("/admin/discounts", { params }),
  /** Bir kampanyanın kupon kodları, Excel dosyası olarak. */
  exportDiscountCodes: (discountId: string) =>
    api.get(`/admin/discounts/${discountId}/codes/export`, {
      responseType: "blob",
    }),

  // Hero slaytları (ana sayfa + giriş/kayıt ekranları)
  getHeroSlides: (params?: { placement?: string }) =>
    api.get("/admin/hero-slides", { params }),
  createHeroSlide: (data: any) => api.post("/admin/hero-slides", data),
  updateHeroSlide: (id: string, data: any) =>
    api.patch(`/admin/hero-slides/${id}`, data),
  deleteHeroSlide: (id: string) => api.delete(`/admin/hero-slides/${id}`),
  reorderHeroSlides: (ids: string[]) =>
    api.patch("/admin/hero-slides/reorder", { ids }),
  /** Hero görseli yükleme (multipart `file`); yanıt `{ url }`. */
  uploadHeroImage: (file: File) => {
    const formData = new FormData();
    formData.append("file", file);
    return api.post<{ url: string }>("/admin/hero-slides/upload", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });
  },

  // Güven rozetleri
  getTrustBadges: () => api.get("/admin/trust-badges"),
  createTrustBadge: (data: any) => api.post("/admin/trust-badges", data),
  updateTrustBadge: (id: string, data: any) =>
    api.patch(`/admin/trust-badges/${id}`, data),
  deleteTrustBadge: (id: string) => api.delete(`/admin/trust-badges/${id}`),
  reorderTrustBadges: (ids: string[]) =>
    api.patch("/admin/trust-badges/reorder", { ids }),

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
  sendNotification: (data: NotificationBroadcastPayload) =>
    api.post("/admin/notifications/send", data),
  scheduleNotification: (
    data: NotificationBroadcastPayload & { scheduledFor: string },
  ) => api.post("/admin/notifications/schedule", data),
  /** E-posta gövdesine eklenecek görseli yükler (multipart `file`); yanıt `{ url }`. */
  uploadNotificationImage: (file: File) => {
    const formData = new FormData();
    formData.append("file", file);
    return api.post<{ url: string }>("/admin/notifications/upload", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });
  },
  /** Gerçekte gidecek (sunucuda süzülmüş + iskeletli) e-postayı döner. */
  previewBroadcastEmail: (data: BroadcastEmailPreviewPayload) =>
    api.post("/admin/notifications/email-preview", data),
  /** Hedef kitlenin toplam / pazarlama-izinli kullanıcı sayısı. */
  countNotificationAudience: (data: {
    targetType: "all" | "segment" | "user_ids";
    userIds?: string[];
    segmentCriteria?: Record<string, any>;
  }) => api.post("/admin/notifications/audience-count", data),
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
