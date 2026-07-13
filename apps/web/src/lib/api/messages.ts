import { api } from "./client";

// Messages (thread-based messaging)
export const messagesApi = {
  getThreads: (params?: Record<string, any>) =>
    api.get("/messages/threads", { params }),
  getThread: (threadId: string) => api.get(`/messages/threads/${threadId}`),
  getMessages: (threadId: string, params?: Record<string, any>) =>
    api.get(`/messages/threads/${threadId}/messages`, { params }),
  createThread: (data: { participantId: string; productId?: string }) =>
    api.post("/messages/threads", data),
  sendMessage: (threadId: string, content: string) =>
    api.post(`/messages/threads/${threadId}/messages`, { content }),
};
