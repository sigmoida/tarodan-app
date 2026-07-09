import { api, guestApi } from './client';

// Categories API - Web ile aynı endpoint'ler
export const categoriesApi = {
  getAll: (params?: Record<string, any>) =>
    api.get('/categories', { params }),
  getOne: (id: string) =>
    api.get(`/categories/${id}`),
  getBySlug: (slug: string) =>
    api.get(`/categories/slug/${slug}`),
};

// Collections API - Web ile aynı endpoint'ler
export const collectionsApi = {
  browse: (params?: Record<string, any>) =>
    api.get('/collections/browse', { params }),
  getMyCollections: (params?: Record<string, any>) =>
    api.get('/collections/me', { params }),
  getLikedCollections: (params?: Record<string, any>) =>
    api.get('/collections/liked', { params }),
  getOne: (id: string) =>
    api.get(`/collections/${id}`),
  getBySlug: (slug: string) =>
    api.get(`/collections/slug/${slug}`),
  getUserCollections: (userId: string, params?: Record<string, any>) =>
    api.get(`/collections/user/${userId}`, { params }),
  create: (data: { name: string; description?: string; coverImageUrl?: string; isPublic?: boolean }) =>
    api.post('/collections', data),
  update: (id: string, data: { name?: string; description?: string; coverImageUrl?: string; isPublic?: boolean }) =>
    api.patch(`/collections/${id}`, data),
  delete: (id: string) =>
    api.delete(`/collections/${id}`),
  addItem: (id: string, data: { productId: string; sortOrder?: number; isFeatured?: boolean }) =>
    api.post(`/collections/${id}/items`, data),
  removeItem: (id: string, itemId: string) =>
    api.delete(`/collections/${id}/items/${itemId}`),
  like: (id: string) =>
    api.post(`/collections/${id}/like`),
  unlike: (id: string) =>
    api.delete(`/collections/${id}/like`),
};

/** CMS statik sayfalar (hakkımızda, gizlilik, KVKK vb.) */
export const pagesApi = {
  getBySlug: (slug: string) =>
    guestApi.get<{
      id: string;
      slug: string;
      title: string;
      content: string;
      metaTitle: string | null;
      metaDescription: string | null;
      metaKeywords: string | null;
      updatedAt: string;
    }>(`/pages/${slug}`),
};

/** Destek / İletişim */
export const supportApi = {
  guestContact: (data: { name: string; email: string; message: string; subject?: string }) =>
    guestApi.post('/support/contact', data),
  createTicket: (data: {
    subject: string;
    category: string;
    priority?: string;
    message: string;
    orderId?: string;
    tradeId?: string;
    attachments?: string[];
  }) => api.post('/support/tickets', data),
  getMyTickets: (params?: { page?: number; pageSize?: number; status?: string }) =>
    api.get('/support/tickets/me', { params }),
  getTicket: (id: string) => api.get(`/support/tickets/${id}`),
  addMessage: (id: string, data: { content: string; attachments?: string[] }) =>
    api.post(`/support/tickets/${id}/messages`, data),
};
