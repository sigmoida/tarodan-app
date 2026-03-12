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

            // Only auto-redirect for expired sessions; never redirect on public/guest pages
            if (hadToken) {
              const currentPath = (typeof window !== 'undefined' && window.location?.pathname) || '';
              const publicPathsNoRedirect = ['/track-order', '/orders/track', '/login', '/register'];
              const isPublicPath = publicPathsNoRedirect.some(p => currentPath === p || currentPath.startsWith(p + '/'));
              if (isPublicPath) {
                if (process.env.NODE_ENV === 'development') {
                  console.debug('[api] 401 after refresh failed – on public path, not redirecting', { currentPath });
                }
              } else {
                const protectedPaths = ['/profile', '/orders', '/messages', '/favorites', '/cart/checkout'];
                const isProtectedPath = protectedPaths.some(path => currentPath.startsWith(path));
                if (process.env.NODE_ENV === 'development') {
                  console.debug('[api] 401 after refresh failed', { currentPath, isProtectedPath, hadToken });
                }
                if (isProtectedPath) {
                  window.location.href = '/login?expired=true';
                }
              }
            }

            return Promise.reject(refreshError);
          }
        } else {
          // No refresh token or refresh endpoint failed, handle as before
          const hadToken = localStorage.getItem('auth_token');
          localStorage.removeItem('auth_token');
          localStorage.removeItem('refresh_token');

          // Only auto-redirect for expired sessions; never redirect on public/guest pages
          if (hadToken) {
            const currentPath = (typeof window !== 'undefined' && window.location?.pathname) || '';
            const publicPathsNoRedirect = ['/track-order', '/orders/track', '/login', '/register'];
            const isPublicPath = publicPathsNoRedirect.some(p => currentPath === p || currentPath.startsWith(p + '/'));
            if (isPublicPath) {
              if (process.env.NODE_ENV === 'development') {
                console.debug('[api] 401 no refresh – on public path, not redirecting', { currentPath });
              }
            } else {
              const protectedPaths = ['/profile', '/orders', '/messages', '/favorites', '/cart/checkout'];
              const isProtectedPath = protectedPaths.some(path => currentPath.startsWith(path));
              if (process.env.NODE_ENV === 'development') {
                console.debug('[api] 401 no refresh', { currentPath, isProtectedPath, hadToken });
              }
              if (isProtectedPath) {
                window.location.href = '/login?expired=true';
              }
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
  getFilters: () => api.get('/products/filters'),
  getPopular: (params?: { limit?: number; page?: number }) =>
    api.get('/products/popular', { params: { limit: 20, page: 1, ...params }, headers: { 'Cache-Control': 'no-cache', Pragma: 'no-cache' } }),
  getAll: (params?: Record<string, any>) =>
    api.get('/products', { params, headers: { 'Cache-Control': 'no-cache', Pragma: 'no-cache' } }),
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
    billingAddressId?: string;
    billingAddress?: {
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
  trackGuest: (data: { orderNumber: string; email: string }) =>
    api.post('/orders/guest/track', data),
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

  // Direct Payment API
  processDirect: (data: {
    orderId: string;
    card?: {
      cardHolderName: string;
      cardNumber: string;
      expireMonth: string;
      expireYear: string;
      cvc: string;
      cardAlias?: string;
    };
    cardToken?: string;
    saveCard?: boolean;
    provider?: string;
  }) => api.post('/payments/process-direct', data),

  getPaymentMethods: () => api.get('/payments/methods'),

  addPaymentMethod: (data: {
    card: {
      cardHolderName: string;
      cardNumber: string;
      expireMonth: string;
      expireYear: string;
      cvc: string;
      cardAlias?: string;
    };
  }) => api.post('/payments/methods', data),

  deletePaymentMethod: (cardToken: string) => api.delete(`/payments/methods/${cardToken}`),
};

// Addresses
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
  updateCover: (id: string | number, file: File) => {
    const formData = new FormData();
    formData.append('cover', file);
    return api.patch(`/collections/${id}/cover`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
  },
  browse: (params?: Record<string, any>) =>
    api.get('/collections/browse', { params }),
  getMyCollections: (params?: Record<string, any>) =>
    api.get('/collections/me', { params }),
  getLiked: (params?: Record<string, any>) =>
    api.get('/collections/liked', { params }),
  getOne: (id: string) => api.get(`/collections/${id}`),
  getBySlug: (slug: string) => api.get(`/collections/slug/${slug}`),
  create: (data: { name: string; description?: string; coverImageKey?: string; isPublic?: boolean; categoryId?: string }) =>
    api.post('/collections', data),
  update: (id: string, data: { name?: string; description?: string; coverImageKey?: string; isPublic?: boolean; categoryId?: string | null }) =>
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
      customManufacturer?: string;
      customMaterial?: string;
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
    if (data.customManufacturer) formData.append('customManufacturer', data.customManufacturer);
    if (data.customMaterial) formData.append('customMaterial', data.customMaterial);
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

// Manufacturers
export const manufacturersApi = {
  findAll: () => api.get('/manufacturers'),
  findOne: (id: string) => api.get(`/manufacturers/${id}`),
  findBySlug: (slug: string) => api.get(`/manufacturers/slug/${slug}`),
};

// Brands
export const brandsApi = {
  findAll: () => api.get('/brands'),
  findBySlug: (slug: string) => api.get(`/brands/${slug}`),
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
  autocompleteRich: (q: string) =>
    api.get<{
      products: Array<{ id: string; title: string; imageUrl?: string; price: number; brandName?: string }>;
      brands: Array<{ id: string; name: string; slug: string; logo?: string | null }>;
      categories: Array<{ id: string; name: string; slug: string }>;
      manufacturers: Array<{ id: string; name: string; slug: string; logo?: string | null }>;
      suggestions: string[];
    }>('/search/autocomplete-rich', { params: { q } }),
};

// Discounts
export const discountsApi = {
  getAll: (params?: Record<string, any>) =>
    api.get('/discounts', { params }),
  getOne: (id: string) => api.get(`/discounts/${id}`),
  create: (data: {
    code?: string;
    name: string;
    description?: string;
    type: 'percentage' | 'fixed_amount';
    value: number;
    scope: 'global' | 'category' | 'product' | 'seller';
    categoryId?: string;
    targetProductIds?: string[];
    minCartValue?: number;
    maxDiscountAmount?: number;
    usageLimitTotal?: number;
    usageLimitPerUser?: number;
    isStackable?: boolean;
    priority?: number;
    isActive?: boolean;
    startDate: string;
    endDate: string;
  }) => api.post('/discounts', data),
  update: (id: string, data: Record<string, any>) =>
    api.patch(`/discounts/${id}`, data),
  delete: (id: string) => api.delete(`/discounts/${id}`),
  validate: (data: { code: string; cartItems: Array<{ productId: string; quantity: number; price: number }> }) =>
    api.post('/discounts/validate', data),
  getActiveCampaigns: () => api.get('/discounts/active'),
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
  uploadMessageImage: (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return api.post<{ url: string; key?: string }>('/media/upload?folder=messages', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
  },
  deleteFile: (key: string) => api.delete(`/media/${key}`),
};

// Static pages (public, no auth)
export const pagesApi = {
  getBySlug: (slug: string) => api.get<{
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

export default api;


