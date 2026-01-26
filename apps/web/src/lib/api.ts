import axios from 'axios';

// Use relative URL to go through Next.js rewrite proxy (avoids CORS)
export const api = axios.create({
  baseURL: '/api',
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor
api.interceptors.request.use(
  (config) => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null;
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;

      if (typeof window !== 'undefined') {
        const refreshToken = localStorage.getItem('refresh_token');
        
        // Try to refresh token if we have a refresh token
        if (refreshToken && originalRequest.url !== '/auth/refresh') {
          try {
            // Use a new axios instance to avoid interceptor loop
            const refreshResponse = await axios.post('/api/auth/refresh', { refreshToken }, {
              headers: { 'Content-Type': 'application/json' },
            });
            const { accessToken, refreshToken: newRefreshToken } = refreshResponse.data;
            
            // Update tokens in localStorage
            localStorage.setItem('auth_token', accessToken);
            if (newRefreshToken) {
              localStorage.setItem('refresh_token', newRefreshToken);
            }
            
            // Update the original request with new token
            originalRequest.headers.Authorization = `Bearer ${accessToken}`;
            
            // Retry the original request
            return api(originalRequest);
          } catch (refreshError) {
            // Refresh failed, logout user
            const hadToken = localStorage.getItem('auth_token');
            localStorage.removeItem('auth_token');
            localStorage.removeItem('refresh_token');
            
            // Only auto-redirect for expired sessions, not for guest access attempts
            if (hadToken) {
              // Check if we're on a page that requires auth
              const protectedPaths = ['/profile', '/orders', '/messages', '/favorites', '/cart/checkout'];
              const currentPath = window.location.pathname;
              const isProtectedPath = protectedPaths.some(path => currentPath.startsWith(path));
              
              if (isProtectedPath) {
                window.location.href = '/login?expired=true';
              }
            }
            
            return Promise.reject(refreshError);
          }
        } else {
          // No refresh token or refresh endpoint failed, handle as before
          const hadToken = localStorage.getItem('auth_token');
          localStorage.removeItem('auth_token');
          localStorage.removeItem('refresh_token');
          
          // Only auto-redirect for expired sessions, not for guest access attempts
          if (hadToken) {
            // Check if we're on a page that requires auth
            const protectedPaths = ['/profile', '/orders', '/messages', '/favorites', '/cart/checkout'];
            const currentPath = window.location.pathname;
            const isProtectedPath = protectedPaths.some(path => currentPath.startsWith(path));
            
            if (isProtectedPath) {
              window.location.href = '/login?expired=true';
            }
          }
          // For guests trying to access protected API endpoints, just reject the promise
          // The UI will handle showing auth modals
        }
      }
    }
    return Promise.reject(error);
  }
);

// Auth
export const authApi = {
  login: (email: string, password: string) =>
    api.post('/auth/login', { email, password }),
  register: (data: { displayName: string; email: string; password: string; phone?: string; birthDate?: string; acceptsMarketingEmails?: boolean }) =>
    api.post('/auth/register', data),
  logout: () => api.post('/auth/logout'),
  getProfile: () => api.get('/auth/profile'),
  refresh: (refreshToken: string) =>
    api.post('/auth/refresh', { refreshToken }),
};

// Products (was Listings - endpoint is /products in backend)
export const listingsApi = {
  getAll: (params?: Record<string, any>) =>
    api.get('/products', { params }),
  getOne: (id: string | number) => api.get(`/products/${id}`),
  getById: (id: string | number) => api.get(`/products/${id}`),
  create: (data: Record<string, any>) =>
    api.post('/products', data),
  update: (id: string | number, data: Record<string, any>) =>
    api.patch(`/products/${id}`, data),
  delete: (id: string | number) => api.delete(`/products/${id}`),
};

// Trades
export const tradesApi = {
  getAll: (params?: Record<string, any>) =>
    api.get('/trades', { params }),
  getOne: (id: string | number) => api.get(`/trades/${id}`),
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
  counter: (id: string | number, data: {
    initiatorItems: Array<{ productId: string; quantity: number }>;
    receiverItems: Array<{ productId: string; quantity: number }>;
    cashAmount?: number;
    message?: string;
  }) => api.post(`/trades/${id}/counter`, data),
  cancel: (id: string | number, reason?: string) =>
    api.post(`/trades/${id}/cancel`, { reason }),
  ship: (id: string | number, data: { fromAddressId: string; carrier: string }) =>
    api.post(`/trades/${id}/ship`, data),
  confirmReceipt: (id: string | number) =>
    api.post(`/trades/${id}/confirm-receipt`),
  raiseDispute: (id: string | number, data: { reason: string; description: string; evidenceUrls?: string[] }) =>
    api.post(`/trades/${id}/dispute`, data),
};

// Wishlist (no cart in backend - use wishlist for favorites)
export const wishlistApi = {
  get: () => api.get('/wishlist'),
  add: (productId: string) => api.post('/wishlist', { productId }),
  remove: (productId: string) => api.delete(`/wishlist/${productId}`),
  check: (productId: string) => api.get(`/wishlist/check/${productId}`),
  clear: () => api.delete('/wishlist'),
};

// Cart - simulated via local storage (no cart endpoint in backend)
export const cartApi = {
  get: () => Promise.resolve({ data: { items: [], total: 0 } }),
  add: (productId: string) => Promise.resolve({ data: { success: true } }),
  remove: (itemId: string) => Promise.resolve({ data: { success: true } }),
  clear: () => Promise.resolve({ data: { success: true } }),
};

// Orders
export const ordersApi = {
  getAll: (params?: Record<string, any>) =>
    api.get('/orders', { params }),
  getOne: (id: string | number) => api.get(`/orders/${id}`),
  create: (data: any) => api.post('/orders', data),
  // Direct buy for authenticated users (Buy Now)
  directBuy: (data: {
    productId: string;
    shippingAddressId?: string;
    shippingAddress?: {
      fullName: string;
      phone: string;
      city: string;
      district: string;
      address: string;
      zipCode?: string;
    };
  }) => api.post('/orders/buy', data),
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
};

// Payments
export const paymentsApi = {
  initiate: (orderId: string | number, provider: 'paytr' | 'iyzico') =>
    api.post('/payments/initiate', { orderId, provider }),
  initiateGuest: (orderId: string | number, provider: 'paytr' | 'iyzico') =>
    api.post('/payments/initiate-guest', { orderId, provider }),
  getStatus: (paymentId: string) =>
    api.get(`/payments/${paymentId}`),
  getStatusLight: (paymentId: string) =>
    api.get(`/payments/${paymentId}/status`),
  getStatusLightGuest: (paymentId: string) =>
    api.get(`/payments/${paymentId}/status-guest`),
  getMyPayments: (params?: {
    status?: string;
    provider?: string;
    startDate?: string;
    endDate?: string;
    page?: number;
    limit?: number;
  }) => api.get('/payments/me', { params }),
  cancel: (paymentId: string) =>
    api.post(`/payments/${paymentId}/cancel`),
  refund: (orderId: string, refundAmount?: number) =>
    api.post('/payments/refund', { orderId, refundAmount }),
  retry: (paymentId: string) =>
    api.post(`/payments/${paymentId}/retry`),
};

// Addresses
export const addressesApi = {
  getAll: () => api.get('/users/me/addresses'),
  getOne: (id: string) => api.get(`/users/me/addresses/${id}`),
  create: (data: {
    fullName: string;
    phone: string;
    city: string;
    district: string;
    address: string;
    zipCode?: string;
    isDefault?: boolean;
  }) => api.post('/users/me/addresses', data),
  update: (id: string, data: {
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

// User Profile
export const userApi = {
  getProfile: () => api.get('/users/me'),
  updateProfile: (data: {
    displayName?: string;
    phone?: string;
    bio?: string;
  }) => api.patch('/users/me', data),
  getMyProducts: (params?: Record<string, any>) =>
    api.get('/products/my', { params }),
  getMyProductById: (id: string) => api.get(`/products/my/${id}`),
  getStats: () => api.get('/users/me/stats'),
};

// Messages (thread-based messaging)
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
};

// Collections
export const collectionsApi = {
  browse: (params?: Record<string, any>) =>
    api.get('/collections/browse', { params }),
  getMyCollections: (params?: Record<string, any>) =>
    api.get('/collections/me', { params }),
  getLiked: (params?: Record<string, any>) =>
    api.get('/collections/liked', { params }),
  getOne: (id: string) => api.get(`/collections/${id}`),
  getBySlug: (slug: string) => api.get(`/collections/slug/${slug}`),
  create: (data: { name: string; description?: string; coverImageUrl?: string; isPublic?: boolean }) =>
    api.post('/collections', data),
  update: (id: string, data: { name?: string; description?: string; coverImageUrl?: string; isPublic?: boolean }) =>
    api.patch(`/collections/${id}`, data),
  delete: (id: string) => api.delete(`/collections/${id}`),
  addItem: (
    id: string,
    data: {
      productId?: string;
      customTitle?: string;
      customDescription?: string;
      customBrand?: string;
      customModel?: string;
      customYear?: number;
      customScale?: string;
      customImageUrl?: string;
      sortOrder?: number;
      isFeatured?: boolean;
      imageFile?: File;
    },
  ) => {
    const formData = new FormData();
    
    // Add all data fields to FormData
    if (data.productId) formData.append('productId', data.productId);
    if (data.customTitle) formData.append('customTitle', data.customTitle);
    if (data.customDescription) formData.append('customDescription', data.customDescription);
    if (data.customBrand) formData.append('customBrand', data.customBrand);
    if (data.customModel) formData.append('customModel', data.customModel);
    if (data.customYear !== undefined) formData.append('customYear', data.customYear.toString());
    if (data.customScale) formData.append('customScale', data.customScale);
    if (data.customImageUrl) formData.append('customImageUrl', data.customImageUrl);
    if (data.sortOrder !== undefined) formData.append('sortOrder', data.sortOrder.toString());
    if (data.isFeatured !== undefined) formData.append('isFeatured', data.isFeatured.toString());
    
    // Add image file if provided
    if (data.imageFile) {
      formData.append('image', data.imageFile);
    }
    
    return api.post(`/collections/${id}/items`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
  },
  removeItem: (id: string, itemId: string) =>
    api.delete(`/collections/${id}/items/${itemId}`),
  like: (id: string) => api.post(`/collections/${id}/like`),
  unlike: (id: string) => api.delete(`/collections/${id}/like`),
};

// Categories
export const categoriesApi = {
  findAll: (params?: Record<string, any>) => api.get('/categories', { params }),
  findOne: (id: string) => api.get(`/categories/${id}`),
  findBySlug: (slug: string) => api.get(`/categories/slug/${slug}`),
};

// Membership
export const membershipApi = {
  getTiers: () => api.get('/membership/tiers'),
  getCurrentMembership: () => api.get('/membership/me'),
  getLimits: () => api.get('/membership/me/limits'),
  subscribe: (data: { tierType: string; billingPeriod: 'monthly' | 'yearly' }) =>
    api.post('/membership/subscribe', data),
  cancel: () => api.post('/membership/cancel'),
};

// Notifications
export const notificationsApi = {
  getAll: (params?: Record<string, any>) => api.get('/notifications', { params }),
  markAsRead: (id: string) => api.patch(`/notifications/${id}/read`),
  markAllAsRead: () => api.patch('/notifications/read-all'),
  getUnreadCount: () => api.get('/notifications/unread-count'),
};

// Offers
export const offersApi = {
  getAll: (params?: Record<string, any>) => api.get('/offers', { params }),
  getOne: (id: string) => api.get(`/offers/${id}`),
  create: (data: { productId: string; amount: number; message?: string }) =>
    api.post('/offers', data),
  accept: (id: string) => api.post(`/offers/${id}/accept`),
  reject: (id: string) => api.post(`/offers/${id}/reject`),
  counter: (id: string, amount: number) =>
    api.post(`/offers/${id}/counter`, { amount }),
  cancel: (id: string) => api.post(`/offers/${id}/cancel`),
};

// Ratings
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

// Support / Contact
export const supportApi = {
  // Guest contact form (public, no auth required)
  guestContact: (data: { name: string; email: string; message: string; subject?: string }) =>
    api.post('/support/contact', data),
  // Authenticated user tickets
  createTicket: (data: { subject: string; category: string; message: string; orderId?: string; tradeId?: string; attachments?: string[] }) =>
    api.post('/support/tickets', data),
  getMyTickets: (params?: { page?: number; pageSize?: number; status?: string }) =>
    api.get('/support/tickets/me', { params }),
  getTicket: (id: string) =>
    api.get(`/support/tickets/${id}`),
  addMessage: (id: string, data: { content: string; attachments?: string[] }) =>
    api.post(`/support/tickets/${id}/messages`, data),
};

// Search (ElasticSearch)
export const searchApi = {
  products: (q: string, params?: Record<string, any>) =>
    api.get('/search/products', { params: { q, ...params } }),
  autocomplete: (q: string) =>
    api.get('/search/autocomplete', { params: { q } }),
};

// Media / File Upload
export const mediaApi = {
  uploadProductImages: (files: File[]) => {
    const formData = new FormData();
    files.forEach(file => {
      formData.append('images', file);
    });
    return api.post('/media/upload/product', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
  },
  uploadAvatar: (file: File) => {
    const formData = new FormData();
    formData.append('avatar', file);
    return api.post('/media/upload/avatar', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
  },
  deleteFile: (key: string) => api.delete(`/media/${key}`),
};

export default api;


