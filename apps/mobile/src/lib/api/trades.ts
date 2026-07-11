import { api } from './client';

// Trades API - Web ile aynı endpoint'ler
export const tradesApi = {
  getAll: (params?: Record<string, any>) =>
    api.get('/trades', { params }),
  /** Takaslar sekme sayaçları (filtre/sayfalama bağımsız): { all, pending, shipping, completed } */
  getStatusCounts: () =>
    api.get<{ all: number; pending: number; shipping: number; completed: number }>('/trades/status-counts'),
  getOne: (id: string | number) =>
    api.get(`/trades/${id}`),
  create: (data: {
    receiverId: string;
    initiatorItems: Array<{ productId: string; quantity: number }>;
    receiverItems: Array<{ productId: string; quantity: number }>;
    cashAmount?: number;
    message?: string;
    shippingAddressId?: string;
  }) => api.post('/trades', data),
  accept: (id: string | number, message?: string, shippingAddressId?: string) =>
    api.post(`/trades/${id}/accept`, { message, shippingAddressId }),
  reject: (id: string | number, reason?: string) =>
    api.post(`/trades/${id}/reject`, { reason }),
  cancel: (id: string | number, reason?: string) =>
    api.post(`/trades/${id}/cancel`, { reason }),
  counter: (id: string | number, data: any) =>
    api.post(`/trades/${id}/counter`, data),
  ship: (id: string | number, data: { fromAddressId: string; carrier: string }) =>
    api.post(`/trades/${id}/ship`, data),
  confirmReceipt: (id: string | number) =>
    api.post(`/trades/${id}/confirm-receipt`),
  raiseDispute: (id: string | number, data: { reason: string; description: string; evidenceUrls?: string[] }) =>
    api.post(`/trades/${id}/dispute`, data),
};

// Offers API - Web ile aynı endpoint'ler
export const offersApi = {
  getAll: (params?: Record<string, any>) =>
    api.get('/offers', { params }),
  getOne: (id: string) =>
    api.get(`/offers/${id}`),
  create: (data: { productId: string; amount: number; message?: string }) =>
    api.post('/offers', data),
  accept: (id: string) =>
    api.post(`/offers/${id}/accept`),
  reject: (id: string) =>
    api.post(`/offers/${id}/reject`),
  counter: (id: string, amount: number) =>
    api.post(`/offers/${id}/counter`, { amount }),
  /** Alıcının karşı teklifi (satıcının counter'ından sonra). */
  buyerCounter: (id: string, amount: number) =>
    api.post(`/offers/${id}/buyer-counter`, { amount }),
  cancel: (id: string) =>
    api.post(`/offers/${id}/cancel`),
};

// Ratings API - Web ile aynı endpoint'ler
export const ratingsApi = {
  // User ratings
  getUserRatings: (userId: string, params?: Record<string, any>) =>
    api.get(`/ratings/users/${userId}`, { params }),
  getUserStats: (userId: string) =>
    api.get(`/ratings/users/${userId}/stats`),
  createUserRating: (data: { receiverId: string; orderId?: string; tradeId?: string; score: number; comment?: string }) =>
    api.post('/ratings/users', data),

  // Product ratings
  getProductRatings: (productId: string, params?: Record<string, any>) =>
    api.get(`/ratings/products/${productId}`, { params }),
  getProductStats: (productId: string) =>
    api.get(`/ratings/products/${productId}/stats`),
  createProductRating: (data: { productId: string; orderId: string; score: number; title?: string; review?: string; images?: string[] }) =>
    api.post('/ratings/products', data),
  markHelpful: (ratingId: string) =>
    api.post(`/ratings/products/${ratingId}/helpful`),
};
