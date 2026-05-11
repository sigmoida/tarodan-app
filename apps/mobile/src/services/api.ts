import axios from 'axios';
import * as SecureStore from 'expo-secure-store';
import { router } from 'expo-router';
import { Platform } from 'react-native';
import Constants from 'expo-constants';

// API URL çözümleme sırası:
// 1) EXPO_PUBLIC_API_URL (production / preview / staging build'leri için zorunlu)
// 2) Expo Go LAN host (lokal geliştirme)
// 3) Platform fallback'i (emülatör)
const getApiUrl = () => {
  const envUrl = process.env.EXPO_PUBLIC_API_URL;
  if (envUrl && envUrl.length > 0) {
    return envUrl.replace(/\/$/, '');
  }

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

/**
 * Guest (unauthenticated) axios instance — token eklemez.
 * Kullanım: guest checkout, guest payment, guest order track, guest contact.
 */
export const guestApi = axios.create({
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
  register: (data: {
    displayName: string;
    email: string;
    password: string;
    phone?: string;
    birthDate?: string;
    acceptsMarketingEmails?: boolean;
  }) => api.post('/auth/register', data),
  /** İşletme hesabı olarak kayıt. Web /auth/register/business ile eşleşir. */
  registerBusiness: (data: {
    displayName: string;
    email: string;
    password: string;
    phone?: string;
    birthDate?: string;
    acceptsMarketingEmails?: boolean;
    companyName: string;
    taxId: string;
    taxOffice?: string;
  }) => api.post('/auth/register/business', data),
  logout: () => api.post('/auth/logout'),
  getProfile: () => api.get('/users/me'),
  refresh: (refreshToken: string) => api.post('/auth/refresh', { refreshToken }),
  // Geriye uyumluluk için eski ad korunur
  refreshToken: (refreshToken: string) => api.post('/auth/refresh', { refreshToken }),
  // Şifre sıfırlama / e-posta doğrulama akışı
  forgotPassword: (email: string) =>
    guestApi.post('/auth/forgot-password', { email }),
  resetPassword: (token: string, newPassword: string) =>
    guestApi.post('/auth/reset-password', { token, newPassword }),
  verifyEmail: (token: string) =>
    guestApi.post('/auth/verify-email', { token }),
  resendVerification: () => api.post('/auth/resend-verification'),
  /** Şifre değiştirme — backend `security` modülüne taşındı. */
  changePassword: (currentPassword: string, newPassword: string) =>
    api.post('/security/password/change', { currentPassword, newPassword }),
  // ---- 2FA / Güvenlik (backend: /security/2fa/*) ----
  getTwoFactorStatus: () => api.get('/security/2fa/status'),
  /** 2FA'yı etkinleştir; secret + qrCode + backupCodes döner */
  setupTwoFactor: () =>
    api.post<{ secret: string; qrCode: string; backupCodes?: string[] }>('/security/2fa/enable'),
  verifyTwoFactor: (token: string) =>
    api.post('/security/2fa/verify', { token }),
  disableTwoFactor: (password?: string) =>
    api.post('/security/2fa/disable', password ? { password } : {}),
  regenerateBackupCodes: () => api.post('/security/2fa/backup-codes'),
  /** Tüm cihazlardan çıkış — backend: DELETE /security/tokens */
  logoutAll: () => api.delete('/security/tokens'),
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
  /** Backend: GET /products/my (web ile aynı). Daha önce /products/my-listings kullanılıyordu — backend'de yok. */
  getMyListings: (params?: Record<string, any>) =>
    api.get('/products/my', { params }),
  /** İlanlarım istatistikleri (aktif, satıldı, görüntülenme vb.) */
  getMyStats: () => api.get('/products/my/stats'),
  /** Mevcut sahibinin ilanı — düzenleme için */
  getMyById: (id: string) => api.get(`/products/my/${id}`),
  /** Aynı kategoriden benzer ürünler — backend: GET /products/:id/similar */
  getSimilar: (id: string, limit = 12) =>
    api.get(`/products/${id}/similar`, { params: { limit } }),
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
export type OrderAddressInput = {
  fullName: string;
  phone: string;
  city: string;
  district: string;
  address: string;
  zipCode?: string;
};

export const ordersApi = {
  getAll: (params?: Record<string, any>) =>
    api.get('/orders', { params }),
  getOne: (id: string | number) =>
    api.get(`/orders/${id}`),
  create: (data: any) =>
    api.post('/orders', data),
  /** Buy Now — üye için doğrudan satın alma */
  directBuy: (data: {
    productId: string;
    shippingAddressId?: string;
    shippingAddress?: OrderAddressInput;
    billingAddressId?: string;
    billingAddress?: OrderAddressInput;
  }) => api.post('/orders/buy', data),
  createGuest: (data: {
    productId: string;
    email: string;
    phone: string;
    guestName: string;
    shippingAddress: OrderAddressInput;
    billingAddress?: OrderAddressInput;
    offerId?: string;
    price?: number;
  }) => guestApi.post('/orders/guest', data),
  cancel: (id: string | number, reason?: string) =>
    api.post(`/orders/${id}/cancel`, { reason }),
  /** Alıcı: teslim aldım onayı (backend: POST /orders/:id/confirm). */
  confirm: (id: string | number) =>
    api.post(`/orders/${id}/confirm`),
  /** Satıcı: siparişi hazırlanıyor olarak işaretle (backend: POST /orders/:id/prepare) */
  markAsPreparing: (id: string | number) =>
    api.post(`/orders/${id}/prepare`),
  /** İptal edilmiş teklif siparişini yeniden aç (backend: POST /orders/:id/reactivate) */
  reactivate: (id: string | number) =>
    api.post(`/orders/${id}/reactivate`),
  /** Satıcı tarafında kargo adresi/bilgisi güncelleme */
  setShippingAddress: (id: string | number, data: OrderAddressInput) =>
    api.patch(`/orders/${id}/shipping-address`, data),
  /** Guest sipariş takibi (orderNumber + email) */
  trackGuest: (data: { orderNumber: string; email: string }) =>
    guestApi.post('/orders/guest/track', data),
  /** Checkout quote (fiyat kırılımı) */
  getQuote: (data: { items: Array<{ productId: string; quantity?: number }> }) =>
    api.post('/orders/quote', data),
  /** İlan formunda komisyon önizleme (tek ürün) */
  getCommissionPreview: (params: { amount: number; categoryId?: string }) =>
    api.get('/orders/commission-preview', { params }),
  /** İlanlarım listesi için toplu komisyon önizleme */
  getCommissionPreviewBatch: (items: Array<{ amount: number; categoryId?: string | null }>) =>
    api.post('/orders/commission-preview-batch', { items }),
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

// User API - Web ile aynı endpoint'ler
export const userApi = {
  getProfile: () => api.get('/users/me'),
  updateProfile: (data: {
    displayName?: string;
    phone?: string;
    bio?: string;
    avatarUrl?: string;
  } | FormData) =>
    api.patch('/users/me', data, data instanceof FormData
      ? { headers: { 'Content-Type': 'multipart/form-data' } }
      : undefined),
  /** Hesabı sil (kullanıcının kendi). Backend: DELETE /users/me */
  deleteAccount: () => api.delete('/users/me'),
  /** Genel istatistikler (satıcı analitik dahil). Backend: GET /users/me/business-stats */
  getStats: () => api.get('/users/me/business-stats'),
  /** İlanlarım için ürün-bazlı istatistik (backend: GET /products/my/stats) */
  getMyProductStats: () => api.get('/products/my/stats'),
  /** Analitik raporu (timeRange ile) — backend: GET /users/me/analytics */
  getAnalytics: (params?: { timeRange?: '7d' | '30d' | '90d' | 'all' }) =>
    api.get('/users/me/analytics', { params }),
  /** Kullanıcının public profili — backend: GET /users/:id/profile */
  getPublicProfile: (userId: string) => api.get(`/users/${userId}/profile`),
  /** Kullanıcının takip durumu (sen onu takip ediyor musun?) — GET /users/:id/follow */
  getFollowStatus: (userId: string) => api.get(`/users/${userId}/follow`),
  /** Takip ettiklerim — GET /users/me/following */
  getMyFollowing: () => api.get('/users/me/following'),
  block: (userId: string) => api.post(`/users/${userId}/block`),
  unblock: (userId: string) => api.delete(`/users/${userId}/block`),
  /** Bloke ettiğim kullanıcılar */
  getBlockedUsers: () => api.get('/users/me/blocked'),
  follow: (userId: string) => api.post(`/users/${userId}/follow`),
  unfollow: (userId: string) => api.delete(`/users/${userId}/follow`),
  /** İşletme satıcısına yükselt — backend: POST /users/me/seller */
  upgradeToSeller: (data: { companyName?: string; taxId?: string; taxOffice?: string }) =>
    api.post('/users/me/seller', data),
  /** Anasayfa "Haftanın Şirketi" — backend: GET /users/featured-business */
  getFeaturedBusiness: () => api.get('/users/featured-business'),
  /** Anasayfa "Haftanın Koleksiyoneri" */
  getFeaturedCollector: () => api.get('/users/featured-collector'),
  /** Top sellers (anasayfa fallback) */
  getTopSellers: (params?: { limit?: number }) => api.get('/users/top-sellers', { params }),
  /** Top collections */
  getTopCollections: (params?: { limit?: number }) => api.get('/users/top-collections', { params }),
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
  initiate: (orderId: string | number, provider: 'paytr' = 'paytr') =>
    api.post('/payments/initiate', { orderId, provider }),
  initiateGuest: (orderId: string | number, provider: 'paytr' = 'paytr') =>
    guestApi.post('/payments/initiate-guest', { orderId, provider }),
  /** Takas nakit fark ödemesi başlat */
  initiateTradeCash: (tradeId: string) =>
    api.post('/payments/initiate-trade-cash', { tradeId }),
  getStatus: (paymentId: string) =>
    api.get(`/payments/${paymentId}`),
  getStatusLight: (paymentId: string) =>
    api.get(`/payments/${paymentId}/status`),
  getStatusLightGuest: (paymentId: string) =>
    guestApi.get(`/payments/${paymentId}/status-guest`),
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
  /** Fail sayfasında; hâlâ pending ise rezervasyonu serbest bırakır */
  confirmFailed: (paymentId: string) =>
    api.post(`/payments/${paymentId}/confirm-failed`),
  /** Test bypass: PAYMENT_BYPASS=true iken tek kart başarılı */
  bypassComplete: (paymentId: string, cardNumber?: string) =>
    api.post(
      `/payments/${paymentId}/bypass-complete`,
      cardNumber ? { cardNumber } : {},
    ),
  refund: (orderId: string, refundAmount?: number) =>
    api.post('/payments/refund', { orderId, refundAmount }),
  retry: (paymentId: string) =>
    api.post(`/payments/${paymentId}/retry`),

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
  deletePaymentMethod: (cardToken: string) =>
    api.delete(`/payments/methods/${cardToken}`),
};

// Membership API - Web ile aynı endpoint'ler
export const membershipApi = {
  getTiers: () => api.get('/membership/tiers'),
  getCurrentMembership: () => api.get('/membership/me'),
  /** Kullanıcının üyelik limitleri (maxListings, canTrade vs.) */
  getLimits: () => api.get('/membership/me/limits'),
  /**
   * Üyelik satın alma. Web: subscribe({ tierType, billingPeriod }).
   * Geriye uyum: tierId ilk parametre olarak da desteklenir.
   */
  subscribe: (
    tierOrData: string | { tierType: string; billingPeriod: 'monthly' | 'yearly' },
    billingCycleArg?: 'monthly' | 'yearly',
  ) => {
    if (typeof tierOrData === 'string') {
      return api.post('/membership/subscribe', {
        tierType: tierOrData,
        billingPeriod: billingCycleArg || 'monthly',
      });
    }
    return api.post('/membership/subscribe', tierOrData);
  },
  cancel: () => api.post('/membership/cancel'),
  /** Otomatik yenilemeyi aç/kapa — backend: PATCH /membership/auto-renew */
  setAutoRenew: (autoRenew: boolean) =>
    api.patch('/membership/auto-renew', { autoRenew }),
  /** Üyelik ödemesini başlat — backend: POST /membership/payments/initiate */
  initiatePayment: (data: { tierType: string; billingPeriod: 'monthly' | 'yearly'; provider?: 'paytr' }) =>
    api.post('/membership/payments/initiate', data),
  /** İlan oluşturma sınırı kontrol — GET /membership/check/listing */
  checkListingLimit: () => api.get('/membership/check/listing'),
  /** Takas özelliği erişimi — GET /membership/check/trade */
  checkTradeAccess: () => api.get('/membership/check/trade'),
  /** Koleksiyon özelliği erişimi — GET /membership/check/collection */
  checkCollectionAccess: () => api.get('/membership/check/collection'),
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

// Shipping API — Backend `/shipping`
// Tek kargo firması: Sürat Kargo (backend enum'u diğer değerleri hala içerse de
// uygulama yalnızca 'surat' ile çalışıyor — web ile parite).
export type ShippingProvider = 'surat';

export const shippingApi = {
  /** Şehir/firma için tek satır kargo ücreti (checkout / addresses) */
  getRatesByCity: (params: { city: string; carrier: ShippingProvider; weight?: number }) =>
    api.get<{ rate: number }>('/shipping/rates', { params }),
  /** Geriye uyumluluk: eski parametre adlarıyla aynı çağrıyı yapan alias */
  getRates: (params: { fromCity?: string; toCity?: string; city?: string; carrier?: ShippingProvider; weight?: number }) =>
    api.get<{ rate: number } | any>('/shipping/rates', {
      params: {
        city: params.city ?? params.toCity ?? params.fromCity,
        carrier: params.carrier ?? 'surat',
        weight: params.weight,
      },
    }),
  /** Kullanılabilir kargo firmaları */
  getCarriers: () => api.get('/shipping/carriers'),
  /** Adres bazlı kargo hesaplama (backend: POST /shipping/rates) */
  calculateRates: (data: { fromAddressId: string; toAddressId: string; weight?: number; provider?: ShippingProvider }) =>
    api.post('/shipping/rates', data),
  /** Sipariş için kargo başlat — backend: POST /shipping */
  createShipment: (data: { orderId: string; provider: ShippingProvider }) =>
    api.post('/shipping', data),
  /** Kargo takip numarası gir — backend: PATCH /shipping/:id/tracking */
  updateTracking: (shipmentId: string, data: { trackingNumber: string }) =>
    api.patch(`/shipping/${shipmentId}/tracking`, data),
  /** Tek shipment detayı */
  getShipment: (id: string) => api.get(`/shipping/${id}`),
  /** Siparişin shipment'ları */
  getOrderShipments: (orderId: string) => api.get(`/shipping/order/${orderId}`),
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

  // Autocomplete önerileri (basit)
  autocomplete: (query: string) =>
    api.get('/search/autocomplete', { params: { q: query } }),

  /** Zenginleştirilmiş autocomplete: products + brands + categories + manufacturers + scales + suggestions */
  autocompleteRich: (query: string) =>
    api.get<{
      products: Array<{ id: string; title: string; imageUrl?: string; price: number; brandName?: string }>;
      brands: Array<{ id: string; name: string; slug: string; logo?: string | null }>;
      categories: Array<{ id: string; name: string; slug: string }>;
      manufacturers: Array<{ id: string; name: string; slug: string; logo?: string | null }>;
      carModels?: Array<{ id: string; name: string; slug: string; brandId: string }>;
      scales?: string[];
      materials?: Array<{ slug: string; label: string }>;
      conditions?: Array<{ value: string; label: string }>;
      suggestions: string[];
    }>('/search/autocomplete-rich', { params: { q: query } }),

  // Kullanıcı arama
  users: (query: string, limit?: number) =>
    api.get('/users/search', { params: { q: query, limit } }),
};

// =============================================================================
// Yeni modüller — web paritesi (brands, manufacturers, pages, support, discounts, media)
// =============================================================================

/** Markalar (örn. Porsche, Ferrari) */
export const brandsApi = {
  findAll: () => api.get('/brands'),
  findOne: (id: string) => api.get(`/brands/${id}`),
  findBySlug: (slug: string) => api.get(`/brands/${slug}`),
};

/** Üreticiler / producers (örn. Hot Wheels, Bburago) */
export const manufacturersApi = {
  findAll: () => api.get('/manufacturers'),
  findOne: (id: string) => api.get(`/manufacturers/${id}`),
  findBySlug: (slug: string) => api.get(`/manufacturers/slug/${slug}`),
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

/** İndirim / kupon / kampanya */
export const discountsApi = {
  getAll: (params?: Record<string, any>) => api.get('/discounts', { params }),
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
  validate: (data: {
    code: string;
    cartItems: Array<{ productId: string; quantity: number; price: number }>;
  }) => api.post('/discounts/validate', data),
  getActiveCampaigns: () => api.get('/discounts/active'),
};

/**
 * Medya yükleme. React Native için dosyalar şu formatta iletilir:
 *   { uri: string; name: string; type: string }
 * (Web'deki File ile eşdeğer davranır.)
 */
export type RNFile = { uri: string; name: string; type: string };

const appendRNFile = (formData: FormData, field: string, file: RNFile) => {
  // RN'in kendine özel FormData implementasyonu dosya objesini aşağıdaki şekilde kabul eder.
  // as any cast'i TS'in React Native FormData tiplerinin olmadığı durumlar için gerekli.
  formData.append(field, file as any);
};

export const mediaApi = {
  uploadProductImages: (files: RNFile[]) => {
    const formData = new FormData();
    files.forEach(file => appendRNFile(formData, 'images', file));
    return api.post('/media/upload/product', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
  uploadAvatar: (file: RNFile) => {
    const formData = new FormData();
    appendRNFile(formData, 'avatar', file);
    return api.post('/media/upload/avatar', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
  uploadMessageImage: (file: RNFile) => {
    const formData = new FormData();
    appendRNFile(formData, 'file', file);
    return api.post<{ url: string; key?: string }>(
      '/media/upload',
      formData,
      {
        headers: { 'Content-Type': 'multipart/form-data' },
        params: { folder: 'messages' },
      },
    );
  },
  deleteFile: (key: string) => api.delete(`/media/${encodeURIComponent(key)}`),
};

// =============================================================================
// Car Models API — backend: /car-models (web ile aynı)
// =============================================================================
export const carModelsApi = {
  findAll: (params?: { brandId?: string; brandSlug?: string }) =>
    api.get('/car-models', { params }),
  findOne: (id: string) => api.get(`/car-models/${id}`),
  findBySlug: (slug: string) => api.get(`/car-models/${slug}`),
};

// Upload API — backend `/media` modülüne yönlendirilmiş eski uyumluluk katmanı.
// Yeni kod `mediaApi` kullanmalı; bu wrapper geriye dönük çağrı dosyaları için bırakıldı.
export const uploadApi = {
  /** Tek resim yükle (genel — backend: POST /media/upload). */
  image: (formData: FormData) =>
    api.post('/media/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }).then(res => res.data),
  /** Çoklu resim yükle (backend: POST /media/upload/multiple). */
  images: (formData: FormData) =>
    api.post('/media/upload/multiple', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }).then(res => res.data),
};

// =============================================================================
// REFUND REQUESTS API
// =============================================================================
/**
 * Buyer-side refund request endpoints.
 * Backend module: apps/api/src/modules/refund (RefundController).
 * Reasons (Prisma enum RefundReason): changed_mind | damaged | wrong_item |
 * not_as_described | missing_parts | other.
 */
export const refundsApi = {
  /** POST /orders/:orderId/refund-requests */
  create: (
    orderId: string,
    body: { reason: string; description?: string; evidencePhotoUrls?: string[] },
  ) => api.post(`/orders/${orderId}/refund-requests`, body),
  /** GET /refund-requests/:id */
  getById: (id: string) => api.get(`/refund-requests/${id}`),
  /** GET /refund-requests/me — buyer's own refund requests */
  getMine: () => api.get('/refund-requests/me'),
  /** POST /refund-requests/:id/cancel */
  cancel: (id: string) => api.post(`/refund-requests/${id}/cancel`),
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
  // Yeni modüller
  brands: brandsApi,
  manufacturers: manufacturersApi,
  pages: pagesApi,
  support: supportApi,
  discounts: discountsApi,
  media: mediaApi,
  userReports: userReportsApi,
  carModels: carModelsApi,
};

export default api;
