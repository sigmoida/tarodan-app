import { api } from "./client";

// Notifications
export const notificationsApi = {
  getAll: (params?: Record<string, any>) =>
    api.get("/notifications", { params }),
  markAsRead: (id: string) => api.patch(`/notifications/${id}/read`),
  markAllAsRead: () => api.post("/notifications/mark-all-read"),
  getUnreadCount: () => api.get("/notifications/unread-count"),
};
