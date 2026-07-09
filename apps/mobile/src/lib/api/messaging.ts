import { api } from './client';

// Messages API - Web ile aynı endpoint'ler
export const messagesApi = {
  getThreads: (params?: Record<string, any>) =>
    api.get('/messages/threads', { params }),
  getThread: (threadId: string) =>
    api.get(`/messages/threads/${threadId}`),
  getMessages: (threadId: string, params?: Record<string, any>) =>
    api.get(`/messages/threads/${threadId}/messages`, { params }),
  createThread: (data: { participantId: string; productId?: string }) =>
    api.post('/messages/threads', data),
  sendMessage: (threadId: string, content: string) =>
    api.post(`/messages/threads/${threadId}/messages`, { content }),
  markAsRead: (threadId: string) =>
    api.post(`/messages/threads/${threadId}/read`),
  /** Tüm thread'lerdeki toplam okunmamış mesaj sayısı (header rozeti, sayfalama bağımsız) */
  getUnreadCount: () =>
    api.get<{ count: number }>('/messages/unread-count'),
};

// Notifications API - Web ile aynı endpoint'ler
export const notificationsApi = {
  getAll: (params?: Record<string, any>) => api.get('/notifications', { params }),
  markAsRead: (id: string) => api.patch(`/notifications/${id}/read`),
  /** Backend: POST /notifications/mark-all-read */
  markAllAsRead: () => api.post('/notifications/mark-all-read'),
  getUnreadCount: () => api.get<{ count: number }>('/notifications/unread-count'),
  /** Mobile push bildirimleri için cihaz token kaydı (backend: POST /notifications/push-token) */
  registerPushToken: (data: { token: string; platform: 'ios' | 'android'; deviceId?: string }) =>
    api.post('/notifications/push-token', data),
};
