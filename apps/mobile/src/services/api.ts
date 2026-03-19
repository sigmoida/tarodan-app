import axios from 'axios';
import * as SecureStore from 'expo-secure-store';
import { router } from 'expo-router';
import { Platform } from 'react-native';
import Constants from 'expo-constants';

const getApiUrl = () => {
  const expoHost = Constants.expoConfig?.hostUri?.split(':')[0];
  if (expoHost) {
    return `http://${expoHost}:3001/api`;
  }
  if (Platform.OS === 'android') {
    return 'http://10.0.2.2:3001/api';
  }
  return 'http://localhost:3001/api';
};

const API_URL = getApiUrl();

export const api = axios.create({
  baseURL: API_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

api.interceptors.request.use(
  async (config) => {
    try {
      const token = await SecureStore.getItemAsync('accessToken');
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
    } catch (error) {
      // silent
    }
    return config;
  },
  (error) => Promise.reject(error)
);

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;
      try {
        const refreshToken = await SecureStore.getItemAsync('refreshToken');
        if (refreshToken) {
          const response = await axios.post(`${API_URL}/auth/refresh`, { refreshToken });
          const { accessToken } = response.data;
          await SecureStore.setItemAsync('accessToken', accessToken);
          originalRequest.headers.Authorization = `Bearer ${accessToken}`;
          return api(originalRequest);
        }
      } catch {
        await SecureStore.deleteItemAsync('accessToken');
        await SecureStore.deleteItemAsync('refreshToken');
        router.replace('/(auth)/login');
      }
    }
    return Promise.reject(error);
  }
);

// =============================================================================
// API MODULES
// =============================================================================

export const parseResponse = (response: any) => {
  return response.data?.data || response.data?.products || response.data || [];
};

export const authApi = {
  login: (email: string, password: string) =>
    api.post('/auth/login', { email, password }),
  register: (data: { displayName: string; email: string; password: string; phone?: string }) =>
    api.post('/auth/register', data),
  logout: () => api.post('/auth/logout'),
  getProfile: () => api.get('/users/me'),
  refreshToken: (refreshToken: string) =>
    api.post('/auth/refresh', { refreshToken }),
  resendVerification: (email: string) =>
    api.post('/auth/resend-verification', { email }),
  verifyEmail: (token: string) =>
    api.post('/auth/verify-email', { token }),
};

export const productsApi = {
  getAll: (params?: Record<string, any>) =>
    api.get('/products', { params }),
  getOne: (id: string | number) =>
    api.get(`/products/${id}`),
  getById: (id: string | number) =>
    api.get(`/products/${id}`),
  getPopular: (params?: { limit?: number; page?: number }) =>
    api.get('/products/popular', { params: { limit: 20, page: 1, ...params } }),
  create: (data: Record<string, any>) =>
    api.post('/products', data),
  update: (id: string | number, data: Record<string, any>) =>
    api.patch(`/products/${id}`, data),
  delete: (id: string | number) =>
    api.delete(`/products/${id}`),
  getMyListings: (params?: Record<string, any>) =>
    api.get('/products/my', { params }),
  getMyProductById: (id: string) =>
    api.get(`/products/my/${id}`),
  search: (params?: Record<string, any>) =>
    api.get('/products/search', { params }),
};

export const categoriesApi = {
  getAll: (params?: Record<string, any>) =>
    api.get('/categories', { params }),
  getOne: (id: string) =>
    api.get(`/categories/${id}`),
  getBySlug: (slug: string) =>
    api.get(`/categories/slug/${slug}`),
};

export const wishlistApi = {
  get: () => api.get('/wishlist'),
  add: (productId: string) => api.post('/wishlist', { productId }),
  remove: (productId: string) => api.delete(`/wishlist/${productId}`),
  check: (productId: string) => api.get(`/wishlist/check/${productId}`),
  clear: () => api.delete('/wishlist'),
};

export const ordersApi = {
  getAll: (params?: Record<string, any>) =>
    api.get('/orders', { params }),
  getOne: (id: string | number) =>
    api.get(`/orders/${id}`),
  create: (data: any) =>
    api.post('/orders', data),
  createGuest: (data: {
    productId: string;
    email: string;
    phone: string;
    guestName: string;
    shippingAddress: {
      fullName: string;
      phone: string;
      city: string;
      district: string;
      address: string;
      zipCode?: string;
    };
    billingAddress?: {
      fullName: string;
      phone: string;
      city: string;
      district: string;
      address: string;
      zipCode?: string;
    };
    offerId?: string;
    price?: number;
  }) => api.post('/orders/guest', data),
  directBuy: (data: {
    productId: string;
    shippingAddressId?: string;
    shippingAddress?: any;
    billingAddress?: any;
  }) => api.post('/orders/buy', data),
  getQuote: (data: { items: Array<{ productId: string; quantity: number }> }) =>
    api.post('/orders/quote', data),
  cancel: (id: string | number, reason?: string) =>
    api.post(`/orders/${id}/cancel`, { reason }),
  confirm: (id: string | number) =>
    api.post(`/orders/${id}/confirm`),
  setShippingAddress: (id: string | number, data: { fullName: string; phone: string; city: string; district: string; address: string; zipCode?: string }) =>
    api.patch(`/orders/${id}/shipping-address`, data),
  trackGuest: (data: { orderNumber: string; email: string }) =>
    api.post('/orders/guest/track', data),
  getCommissionPreview: (params: { amount: number; categoryId?: string }) =>
    api.get('/orders/commission-preview', { params }),
  getCommissionPreviewBatch: (items: Array<{ amount: number; categoryId?: string | null }>) =>
    api.post('/orders/commission-preview-batch', { items }),
  getStatus: (id: string | number) =>
    api.get(`/orders/${id}/status`),
};

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
};

export const collectionsApi = {
  updateCover: (id: string | number, formData: FormData) =>
    api.patch(`/collections/${id}/cover`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }),
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

export const tradesApi = {
  getAll: (params?: Record<string, any>) =>
    api.get('/trades', { params }),
  getOne: (id: string | number) =>
    api.get(`/trades/${id}`),
  create: (data: {
    receiverId: string;
    initiatorItems: Array<{ productId: string; quantity: number }>;
    receiverItems: Array<{ productId: string; quantity: number }>;
    cashAmount?: number;
    message?: string;
  }) => api.post('/trades', data),
  accept: (id: string | number, message?: string) =>
    api.post(`/trades/${id}/accept`, { message }),
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
  initiateCashPayment: (id: string | number) =>
    api.post(`/trades/${id}/cash-payment/initiate`),
};

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
  cancel: (id: string) =>
    api.post(`/offers/${id}/cancel`),
};

export const ratingsApi = {
  getUserRatings: (userId: string, params?: Record<string, any>) =>
    api.get(`/ratings/users/${userId}`, { params }),
  getUserStats: (userId: string) =>
    api.get(`/ratings/users/${userId}/stats`),
  createUserRating: (data: { receiverId: string; orderId?: string; tradeId?: string; score: number; comment?: string }) =>
    api.post('/ratings/users', data),
  getProductRatings: (productId: string, params?: Record<string, any>) =>
    api.get(`/ratings/products/${productId}`, { params }),
  getProductStats: (productId: string) =>
    api.get(`/ratings/products/${productId}/stats`),
  createProductRating: (data: { productId: string; orderId: string; score: number; title?: string; review?: string; images?: string[] }) =>
    api.post('/ratings/products', data),
  markHelpful: (ratingId: string) =>
    api.post(`/ratings/products/${ratingId}/helpful`),
};

export const userApi = {
  getProfile: () => api.get('/users/me'),
  updateProfile: (data: {
    displayName?: string;
    phone?: string;
    bio?: string;
    avatarUrl?: string;
  }) => api.patch('/users/me', data),
  getMyProducts: (params?: Record<string, any>) =>
    api.get('/products/my', { params }),
  getMyProductById: (id: string) =>
    api.get(`/products/my/${id}`),
  getStats: () => api.get('/users/me/stats'),
  getPublicProfile: (userId: string) => api.get(`/users/${userId}`),
  block: (userId: string) => api.post(`/users/${userId}/block`),
  unblock: (userId: string) => api.delete(`/users/${userId}/block`),
  follow: (userId: string) => api.post(`/users/${userId}/follow`),
  unfollow: (userId: string) => api.delete(`/users/${userId}/follow`),
};

export const userReportsApi = {
  create: (data: {
    type: 'product' | 'user' | 'collection' | 'message';
    targetId: string;
    reason: 'spam' | 'inappropriate_content' | 'fake_product' | 'scam' | 'harassment' | 'hate_speech' | 'counterfeit' | 'wrong_category' | 'misleading_info' | 'other';
    description?: string;
  }) => api.post('/user-reports', data),
  getMyReports: () => api.get('/user-reports/me'),
};

export const addressesApi = {
  getAll: () => api.get('/users/me/addresses'),
  getOne: (id: string) => api.get(`/users/me/addresses/${id}`),
  create: (data: {
    title?: string;
    fullName: string;
    phone: string;
    city: string;
    district: string;
    address: string;
    zipCode?: string;
    isDefault?: boolean;
  }) => api.post('/users/me/addresses', data),
  update: (id: string, data: {
    title?: string;
    fullName?: string;
    phone?: string;
    city?: string;
    district?: string;
    address?: string;
    zipCode?: string;
    isDefault?: boolean;
  }) => api.patch(`/users/me/addresses/${id}`, data),
  delete: (id: string) => api.delete(`/users/me/addresses/${id}`),
  setDefault: (id: string) => api.patch(`/users/me/addresses/${id}`, { isDefault: true }),
};

export const paymentsApi = {
  initiate: (orderId: string | number, provider: 'paytr') =>
    api.post('/payments/initiate', { orderId, provider }),
  initiateGuest: (orderId: string | number, provider: 'paytr') =>
    api.post('/payments/initiate-guest', { orderId, provider }),
  initiateTradeCash: (tradeId: string) =>
    api.post('/payments/initiate-trade-cash', { tradeId }),
  getStatus: (paymentId: string) =>
    api.get(`/payments/${paymentId}`),
  getStatusLight: (paymentId: string) =>
    api.get(`/payments/${paymentId}/status`),
  getStatusLightGuest: (paymentId: string) =>
    api.get(`/payments/${paymentId}/status-guest`),
  getMyPayments: (params?: { status?: string; provider?: string; startDate?: string; endDate?: string; page?: number; limit?: number }) =>
    api.get('/payments/me', { params }),
  bypassComplete: (paymentId: string, cardNumber: string) =>
    api.post(`/payments/${paymentId}/bypass-complete`, { cardNumber }),
  confirmFailed: (paymentId: string) =>
    api.post(`/payments/${paymentId}/confirm-failed`),
  cancel: (paymentId: string) =>
    api.post(`/payments/${paymentId}/cancel`),
  refund: (orderId: string, refundAmount?: number) =>
    api.post('/payments/refund', { orderId, refundAmount }),
  retry: (paymentId: string) =>
    api.post(`/payments/${paymentId}/retry`),
  processDirect: (data: {
    orderId: string;
    card?: { cardHolderName: string; cardNumber: string; expireMonth: string; expireYear: string; cvc: string; cardAlias?: string };
    cardToken?: string;
    saveCard?: boolean;
    provider?: string;
  }) => api.post('/payments/process-direct', data),
  getMethods: () =>
    api.get('/payments/methods'),
  addMethod: (data: { cardNumber: string; cardHolder: string; expiryMonth: number; expiryYear: number; cvv: string }) =>
    api.post('/payments/methods', data),
  deleteMethod: (id: string) =>
    api.delete(`/payments/methods/${id}`),
};

export const membershipApi = {
  getTiers: () => api.get('/membership/tiers'),
  getCurrentMembership: () => api.get('/membership/me'),
  getLimits: () => api.get('/membership/me/limits'),
  subscribe: (data: { tierType: string; billingPeriod: 'monthly' | 'yearly' }) =>
    api.post('/membership/subscribe', data),
  cancel: () => api.post('/membership/cancel'),
  getBillingHistory: () => api.get('/membership/billing-history'),
};

export const notificationsApi = {
  getAll: (params?: Record<string, any>) => api.get('/notifications', { params }),
  markAsRead: (id: string) => api.patch(`/notifications/${id}/read`),
  markAllAsRead: () => api.patch('/notifications/read-all'),
  getUnreadCount: () => api.get('/notifications/unread-count'),
};

export const shippingApi = {
  getRates: (params: { fromCity: string; toCity: string; weight?: number }) =>
    api.get('/shipping/rates', { params }),
  getCarriers: () => api.get('/shipping/carriers'),
};

export const searchApi = {
  products: (params?: {
    q?: string;
    categoryId?: string;
    minPrice?: number;
    maxPrice?: number;
    condition?: string;
    page?: number;
    pageSize?: number;
    sortBy?: 'relevance' | 'price_asc' | 'price_desc' | 'newest';
  }) => api.get('/search/products', { params }),
  autocomplete: (query: string) =>
    api.get('/search/autocomplete', { params: { q: query } }),
  autocompleteRich: (query: string) =>
    api.get('/search/autocomplete-rich', { params: { q: query } }),
  users: (query: string, limit?: number) =>
    api.get('/users/search', { params: { q: query, limit } }),
};

export const uploadApi = {
  image: (formData: FormData) =>
    api.post('/upload/image', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }).then(res => res.data),
  images: (formData: FormData) =>
    api.post('/upload/images', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }).then(res => res.data),
};

// --- NEW MODULES (web parity) ---

export const brandsApi = {
  findAll: (params?: Record<string, any>) =>
    api.get('/brands', { params }),
  findBySlug: (slug: string) =>
    api.get(`/brands/${slug}`),
};

export const carModelsApi = {
  findAll: (params?: Record<string, any>) =>
    api.get('/car-models', { params }),
  findByBrand: (brandSlug: string) =>
    api.get('/car-models', { params: { brand: brandSlug } }),
};

export const manufacturersApi = {
  findAll: (params?: Record<string, any>) =>
    api.get('/manufacturers', { params }),
  findOne: (id: string) =>
    api.get(`/manufacturers/${id}`),
  findBySlug: (slug: string) =>
    api.get(`/manufacturers/slug/${slug}`),
};

export const listingsApi = {
  ...productsApi,
  getFilters: () => api.get('/products/filters'),
};

export const mediaApi = {
  uploadProductImages: (formData: FormData) =>
    api.post('/media/upload/product', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 60000,
    }),
  uploadAvatar: (formData: FormData) =>
    api.post('/media/upload/avatar', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }),
  uploadMessageImage: (formData: FormData) =>
    api.post('/media/upload?folder=messages', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }),
  deleteFile: (key: string) =>
    api.delete(`/media/${key}`),
};

export const discountsApi = {
  getAll: (params?: Record<string, any>) =>
    api.get('/discounts', { params }),
  getOne: (id: string) =>
    api.get(`/discounts/${id}`),
  create: (data: Record<string, any>) =>
    api.post('/discounts', data),
  update: (id: string, data: Record<string, any>) =>
    api.patch(`/discounts/${id}`, data),
  delete: (id: string) =>
    api.delete(`/discounts/${id}`),
  validate: (data: { code: string; cartItems: Array<{ productId: string; quantity: number; price: number }> }) =>
    api.post('/discounts/validate', data),
  getActiveCampaigns: () =>
    api.get('/discounts/active'),
};

export const pagesApi = {
  getBySlug: (slug: string) =>
    api.get(`/pages/${slug}`),
  getAll: () =>
    api.get('/pages'),
};

export const supportApi = {
  contact: (data: { name: string; email: string; subject: string; message: string }) =>
    api.post('/support/contact', data),
  getMyTickets: (params?: { page?: number; pageSize?: number; status?: string }) =>
    api.get('/support/tickets/me', { params }),
  getTicket: (id: string) =>
    api.get(`/support/tickets/${id}`),
  addMessage: (id: string, data: { content: string; attachments?: string[] }) =>
    api.post(`/support/tickets/${id}/messages`, data),
  createTicket: (data: { subject: string; category: string; message: string; orderId?: string; tradeId?: string; attachments?: string[] }) =>
    api.post('/support/tickets', data),
};

// =============================================================================
// ENDPOINTS OBJECT
// =============================================================================
export const endpoints = {
  auth: authApi,
  products: {
    ...productsApi,
    create: (data: Record<string, any>) => api.post('/products', data).then(res => res.data),
    getAll: (params?: Record<string, any>) => api.get('/products', { params }).then(res => res.data),
    getOne: (id: string | number) => api.get(`/products/${id}`).then(res => res.data),
  },
  categories: {
    getAll: () => api.get('/categories').then(res => res.data),
    getOne: (id: string) => api.get(`/categories/${id}`).then(res => res.data),
  },
  orders: ordersApi,
  messages: messagesApi,
  collections: collectionsApi,
  trades: tradesApi,
  offers: offersApi,
  ratings: ratingsApi,
  user: userApi,
  addresses: addressesApi,
  payments: paymentsApi,
  membership: membershipApi,
  notifications: notificationsApi,
  shipping: shippingApi,
  search: searchApi,
  upload: uploadApi,
  wishlist: wishlistApi,
  brands: brandsApi,
  carModels: carModelsApi,
  manufacturers: manufacturersApi,
  listings: listingsApi,
  media: mediaApi,
  discounts: discountsApi,
  pages: pagesApi,
  support: supportApi,
};

export default api;
