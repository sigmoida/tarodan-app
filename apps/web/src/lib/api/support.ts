import { api } from "./client";

// Support / Contact
export const supportApi = {
  // Guest contact form (public, no auth required)
  guestContact: (data: {
    name: string;
    email: string;
    message: string;
    subject?: string;
  }) => api.post("/support/contact", data),
  // Authenticated user tickets
  createTicket: (data: {
    subject: string;
    category: string;
    message: string;
    orderId?: string;
    tradeId?: string;
    attachments?: string[];
  }) => api.post("/support/tickets", data),
  getMyTickets: (params?: {
    page?: number;
    pageSize?: number;
    status?: string;
  }) => api.get("/support/tickets/me", { params }),
  getTicket: (id: string) => api.get(`/support/tickets/${id}`),
  addMessage: (id: string, data: { content: string; attachments?: string[] }) =>
    api.post(`/support/tickets/${id}/messages`, data),
};
