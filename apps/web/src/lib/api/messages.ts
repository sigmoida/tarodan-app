import { api } from "./client";

// Messages (thread-based messaging)
export const messagesApi = {
  getThreads: (params?: Record<string, any>) =>
    api.get("/messages/threads", { params }),
  /**
   * Tüm thread'lerdeki toplam okunmamış mesaj — SAYFALAMADAN bağımsız.
   * Rozetler bir zamanlar thread listesinin ilk sayfasındaki `unreadCount`
   * değerlerini topluyordu; 20'den fazla sohbeti olan kullanıcıda sayı eksik
   * çıkıyordu.
   */
  getUnreadCount: () => api.get("/messages/unread-count"),
  getThread: (threadId: string) => api.get(`/messages/threads/${threadId}`),
  getMessages: (threadId: string, params?: Record<string, any>) =>
    api.get(`/messages/threads/${threadId}/messages`, { params }),
  createThread: (data: { participantId: string; productId?: string }) =>
    api.post("/messages/threads", data),
  sendMessage: (threadId: string, content: string, productId?: string) =>
    api.post(`/messages/threads/${threadId}/messages`, { content, productId }),
};
