import axios from 'axios';
import * as SecureStore from 'expo-secure-store';
import { router } from 'expo-router';
import { Platform } from 'react-native';
import Constants from 'expo-constants';

// Expo'nun belirlediği LAN IP'sini al
const getApiUrl = () => {
  // Expo Go'nun çalıştığı bilgisayarın IP'si
  const expoHost = Constants.expoConfig?.hostUri?.split(':')[0];
  
  if (expoHost) {
    // Expo host IP'sini kullan - API /api prefix'i ile
    return `http://${expoHost}:3001/api`;
  }
  
  // Fallback - Android emulator için 10.0.2.2, diğerleri için localhost
  if (Platform.OS === 'android') {
    return 'http://10.0.2.2:3001/api';
  }
  
  return 'http://localhost:3001/api';
};

const API_URL = getApiUrl();

console.log('📡 API URL:', API_URL);
console.log('📱 Platform:', Platform.OS);
console.log('🌐 Expo Host:', Constants.expoConfig?.hostUri);

export const api = axios.create({
  baseURL: API_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor - add auth token
api.interceptors.request.use(
  async (config) => {
    try {
      const token = await SecureStore.getItemAsync('accessToken');
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
    } catch (error) {
      console.error('Error getting token:', error);
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor - handle token refresh
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;

      try {
        const refreshToken = await SecureStore.getItemAsync('refreshToken');
        if (refreshToken) {
          const response = await axios.post(`${API_URL}/auth/refresh`, {
            refreshToken,
          });

          const { accessToken } = response.data;
          await SecureStore.setItemAsync('accessToken', accessToken);

          originalRequest.headers.Authorization = `Bearer ${accessToken}`;
          return api(originalRequest);
        }
      } catch (refreshError) {
        // Refresh failed, logout user
        await SecureStore.deleteItemAsync('accessToken');
        await SecureStore.deleteItemAsync('refreshToken');
        router.replace('/(auth)/login');
      }
    }

    return Promise.reject(error);
  }
);

// =============================================================================
// API MODULES - Web ile aynı endpoint'ler
// =============================================================================

// Helper: Response parsing (web ile aynı)
export const parseResponse = (response: any) => {
  return response.data?.data || response.data?.products || response.data || [];
};

// Auth API - Web ile aynı endpoint'ler
export const authApi = {
  login: (email: string, password: string) =>
    api.post('/auth/login', { email, password }),
  register: (data: { displayName: string; email: string; password: string; phone?: string }) =>
    api.post('/auth/register', data),
  logout: () => api.post('/auth/logout'),
  getProfile: () => api.get('/users/me'),
  refreshToken: (refreshToken: string) =>
    api.post('/auth/refresh', { refreshToken }),
};

// Products API - Web ile aynı endpoint'ler
export const productsApi = {
  getAll: (params?: Record<string, any>) =>
    api.get('/products', { params }),
  getOne: (id: string | number) => 
    api.get(`/products/${id}`),
  create: (data: Record<string, any>) =>
    api.post('/products', data),
  update: (id: string | number, data: Record<string, any>) =>
    api.patch(`/products/${id}`, data),
  delete: (id: string | number) => 
    api.delete(`/products/${id}`),
  getMyListings: (params?: Record<string, any>) =>
    api.get('/products/my-listings', { params }),
  search: (params?: Record<string, any>) =>
    api.get('/products/search', { params }),
};

// Categories API - Web ile aynı endpoint'ler
export const categoriesApi = {
  getAll: (params?: Record<string, any>) => 
    api.get('/categories', { params }),
  getOne: (id: string) => 
    api.get(`/categories/${id}`),
  getBySlug: (slug: string) => 
    api.get(`/categories/slug/${slug}`),
};

// Wishlist API - Web ile aynı endpoint'ler
export const wishlistApi = {
  get: () => api.get('/wishlist'),
  add: (productId: string) => api.post('/wishlist', { productId }),
  remove: (productId: string) => api.delete(`/wishlist/${productId}`),
  check: (productId: string) => api.get(`/wishlist/check/${productId}`),
  clear: () => api.delete('/wishlist'),
};

// Orders API - Web ile aynı endpoint'ler
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
  cancel: (id: string | number, reason?: string) =>
    api.post(`/orders/${id}/cancel`, { reason }),
  confirm: (id: string | number) =>
    api.post(`/orders/${id}/confirm`),
  getStatus: (id: string | number) =>
    api.get(`/orders/${id}/status`),
};

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

// Trades API - Web ile aynı endpoint'ler
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

// User API - Web ile aynı endpoint'ler
export const userApi = {
  getProfile: () => api.get('/users/me'),
  updateProfile: (data: {
    displayName?: string;
    phone?: string;
    bio?: string;
    avatarUrl?: string;
  }) => api.patch('/users/me', data),
  getStats: () => api.get('/users/me/stats'),
  getPublicProfile: (userId: string) => api.get(`/users/${userId}`),
  block: (userId: string) => api.post(`/users/${userId}/block`),
  unblock: (userId: string) => api.delete(`/users/${userId}/block`),
  follow: (userId: string) => api.post(`/users/${userId}/follow`),
  unfollow: (userId: string) => api.delete(`/users/${userId}/follow`),
};

// User Reports API - İçerik raporlama
export const userReportsApi = {
  create: (data: {
    type: 'product' | 'user' | 'collection' | 'message';
    targetId: string;
    reason: 'spam' | 'inappropriate_content' | 'fake_product' | 'scam' | 'harassment' | 'hate_speech' | 'counterfeit' | 'wrong_category' | 'misleading_info' | 'other';
    description?: string;
  }) => api.post('/user-reports', data),
  getMyReports: () => api.get('/user-reports/me'),
};

// Addresses API - Web ile aynı endpoint'ler
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

// Payments API - Web ile aynı endpoint'ler
export const paymentsApi = {
  initiate: (orderId: string | number, provider: 'paytr' | 'iyzico') =>
    api.post(`/payments/order/${orderId}/initiate`, { provider }),
  getStatus: (paymentId: string) =>
    api.get(`/payments/${paymentId}`),
};

// Membership API - Web ile aynı endpoint'ler
export const membershipApi = {
  getTiers: () => api.get('/membership/tiers'),
  getCurrentMembership: () => api.get('/membership'),
  subscribe: (tierId: string, billingCycle: 'monthly' | 'yearly') =>
    api.post('/membership/subscribe', { tierId, billingCycle }),
  cancel: () => api.post('/membership/cancel'),
  getBillingHistory: () => api.get('/subscriptions/me/billing-history'),
};

// Notifications API - Web ile aynı endpoint'ler
export const notificationsApi = {
  getAll: (params?: Record<string, any>) => api.get('/notifications', { params }),
  markAsRead: (id: string) => api.patch(`/notifications/${id}/read`),
  markAllAsRead: () => api.patch('/notifications/read-all'),
  getUnreadCount: () => api.get('/notifications/unread-count'),
};

// Shipping API
export const shippingApi = {
  getRates: (params: { fromCity: string; toCity: string; weight?: number }) =>
    api.get('/shipping/rates', { params }),
  getCarriers: () => api.get('/shipping/carriers'),
};

// Search API - Elasticsearch ile gerçek arama
export const searchApi = {
  // Elasticsearch ile ürün arama
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
  
  // Autocomplete önerileri
  autocomplete: (query: string) => 
    api.get('/search/autocomplete', { params: { q: query } }),
    
  // Kullanıcı arama
  users: (query: string, limit?: number) =>
    api.get('/users/search', { params: { q: query, limit } }),
};

// Upload API
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

// =============================================================================
// ENDPOINTS OBJECT - Unified API access
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
};

export default api;
