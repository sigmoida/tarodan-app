import axios from 'axios';
import { hasAuthMarker, clearAuthMarker } from '@/lib/authMarker';

// Browser → same-origin BFF proxy (`/bff`): the proxy adds the `Bearer` token
// server-side from the Next-owned `web_at` cookie and refreshes it on 401, so the
// browser never holds an API token. Public/guest calls work through the same hop
// (no cookie → no Bearer). Public SSR fetches use the absolute API directly (not
// this client); server-side axios (rare) also goes direct.
const API_ORIGIN = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
const baseURL = typeof window !== 'undefined' ? '/bff' : `${API_ORIGIN}/api`;

export const api = axios.create({
  baseURL,
  // Auth artık httpOnly cookie'lerde; her istekte cookie gönderilsin. Authorization header eklemiyoruz.
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
});

/**
 * httpOnly cookie JS'ten okunamadığı için "kullanıcının oturumu var mıydı" kararını
 * server'ın session ile birlikte yazdığı JS-okunabilir `tarodan_authed` cookie'siyle
 * veririz (token DEĞERİ değil, yalnızca varlık). Bkz. lib/authMarker.
 */
function hadSession(): boolean {
  return hasAuthMarker();
}
function clearSessionMarker() {
  clearAuthMarker();
}

/** Checkout / ödeme sırasında 401'de token silmek PayTR dönüşü veya /payments/status çağrısını kırar. */
function shouldPreserveAuthTokenOn401(): boolean {
  if (typeof window === 'undefined') return false;
  const p = window.location?.pathname || '';
  return p === '/checkout' || p.startsWith('/payment') || p.startsWith('/cart');
}

/**
 * Genuinely private pages — a session that expires while the user is on one
 * should bounce to login. The whole account area lives under `/profile/*`
 * (orders, messages, favorites, notifications, …); the owner-only edit flows are
 * the other private surfaces. Kept in sync with the middleware matcher; public /
 * SEO pages are deliberately absent so a stray 401 there doesn't eject the user.
 */
function isProtectedPath(path: string): boolean {
  if (path.startsWith('/profile')) return true;
  return /^\/(listings|collections)\/[^/]+\/edit$/.test(path);
}

// Response interceptor
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    // Banlı kullanıcı: backend BannedUserGuard tüm istekleri 403 + USER_BANNED
    // ile bloklar. Kullanıcıyı /banned sayfasına yönlendir (zaten oradaysa dokunma).
    const errData = error.response?.data;
    if (
      error.response?.status === 403 &&
      errData?.errorCode === 'USER_BANNED' &&
      typeof window !== 'undefined' &&
      window.location?.pathname !== '/banned' &&
      window.location?.pathname !== '/contact'
    ) {
      const reason = errData.bannedReason
        ? `?reason=${encodeURIComponent(errData.bannedReason)}`
        : '';
      window.location.href = `/banned${reason}`;
      return Promise.reject(error);
    }

    // 401 → the BFF proxy already attempted a server-side refresh; reaching the
    // client means the session is genuinely gone. Clear the marker and, on a
    // protected page, bounce to login. Guests, temporary errors, and checkout /
    // payment returns are left alone (shouldPreserveAuthTokenOn401).
    if (error.response?.status === 401 && typeof window !== 'undefined') {
      const had = hadSession();
      if (had && !shouldPreserveAuthTokenOn401()) {
        const currentPath = window.location?.pathname || '';
        const publicPathsNoRedirect = ['/track-order', '/profile/orders/track', '/login', '/register'];
        const isPublicPath = publicPathsNoRedirect.some(
          (p) => currentPath === p || currentPath.startsWith(p + '/'),
        );
        clearSessionMarker();
        if (!isPublicPath && isProtectedPath(currentPath)) {
          window.location.href = '/login?expired=true';
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
<<<<<<< HEAD
  loginWithGoogle: (idToken: string) =>
    api.post('/auth/google', { idToken }),
  loginWithApple: (idToken: string, fullName?: string) =>
    api.post('/auth/apple', { identityToken: idToken, fullName }),
=======
>>>>>>> web-app-refactor
  register: (data: { displayName: string; email: string; password: string; phone?: string; birthDate?: string; acceptsMarketingEmails?: boolean }) =>
    api.post('/auth/register', data),
  logout: () => api.post('/auth/logout'),
  getProfile: () => api.get('/auth/profile'),
  refresh: (refreshToken: string) =>
    api.post('/auth/refresh', { refreshToken }),
};

// Products (was Listings - endpoint is /products in backend)
export const listingsApi = {
  getFilters: (params?: { manufacturer?: string }) =>
    api.get('/products/filters', { params }),
  getAttributeGroups: (params?: { manufacturer?: string }) =>
    api.get('/products/attribute-groups', { params }),
  getPopular: (params?: { limit?: number; page?: number }) =>
    api.get('/products/popular', { params: { limit: 20, page: 1, ...params }, headers: { 'Cache-Control': 'no-cache', Pragma: 'no-cache' } }),
  getAll: (params?: Record<string, any>) =>
    api.get('/products', { params, headers: { 'Cache-Control': 'no-cache', Pragma: 'no-cache' } }),
  getOne: (id: string | number) => api.get(`/products/${id}`),
  getById: (id: string | number) => api.get(`/products/${id}`),
  getSimilar: (id: string, limit = 12) =>
    api.get(`/products/${id}/similar`, { params: { limit } }),
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
    shippingAddressId?: string;
  }) => api.post('/trades', data),
  accept: (id: string | number, message?: string, shippingAddressId?: string) =>
    api.post(`/trades/${id}/accept`, { message, shippingAddressId }),
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
  initiateCashPayment: (id: string | number) =>
    api.post(`/trades/${id}/cash-payment/initiate`),
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
  sendGuestVerificationCode: (data: { email: string; expectedCheckoutCount?: number }) =>
    api.post<{ success: boolean; expiresInSeconds: number }>('/orders/guest/send-verification-code', data),
  createGuest: (data: {
    productId: string;
    email: string;
    phone: string;
    guestName: string;
    emailVerificationCode: string;
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
  /** Toplu checkout (üye): sepetteki tüm ürünler tek CheckoutGroup altında, tek ödeme */
  checkout: (data: {
    items: Array<{ productId: string }>;
    idempotencyKey: string;
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
    couponCode?: string;
  }) => api.post('/orders/checkout', data),
  /** Toplu checkout (misafir) */
  checkoutGuest: (data: {
    items: Array<{ productId: string }>;
    idempotencyKey: string;
    email: string;
    emailVerificationCode: string;
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
  }) => api.post('/orders/checkout/guest', data),
  /** Alıcının sipariş grupları (gruplu liste) */
  getGroups: (params?: Record<string, any>) =>
    api.get('/orders/groups', { params }),
  /** Tek sipariş grubu detayı */
  getGroup: (id: string) =>
    api.get(`/orders/groups/${id}`),
  cancel: (id: string | number, reason?: string) =>
    api.post(`/orders/${id}/cancel`, { reason }),
  confirm: (id: string | number) =>
    api.post(`/orders/${id}/confirm`),
  setShippingAddress: (id: string | number, data: { fullName: string; phone: string; city: string; district: string; address: string; zipCode?: string }) =>
    api.patch(`/orders/${id}/shipping-address`, data),
  trackGuest: (data: { orderNumber: string; email: string }) =>
    api.post('/orders/guest/track', data),
  /** Checkout quote (pricing breakdown). Use for order summary; same logic as order create. */
  getQuote: (data: { items: Array<{ productId: string; quantity?: number }> }) =>
    api.post('/orders/quote', data),
  /** Commission preview for one amount/category (listing form). */
  getCommissionPreview: (params: { amount: number; categoryId?: string }) =>
    api.get('/orders/commission-preview', { params }),
  /** Batch commission preview for multiple items (e.g. ilanlarım list). */
  getCommissionPreviewBatch: (items: Array<{ amount: number; categoryId?: string | null }>) =>
    api.post('/orders/commission-preview-batch', { items }),
};

// Payments
export const paymentsApi = {
  /** Public ödeme yapılandırması: bypass (dev) ve kayıtlı kart/oto-yenileme (Non3D) açık mı. */
  getConfig: () =>
    api.get<{ bypassEnabled: boolean; recurringEnabled: boolean }>('/payments/config'),
  initiate: (orderId: string | number, provider: 'paytr') =>
    api.post('/payments/initiate', { orderId, provider }),
  /** Grup ödemesi: tek ödeme checkout grubundaki tüm siparişleri kapsar */
  initiateGroup: (checkoutGroupId: string, provider: 'paytr') =>
    api.post('/payments/initiate', { checkoutGroupId, provider }),
  initiateGuest: (orderId: string | number, provider: 'paytr') =>
    api.post('/payments/initiate-guest', { orderId, provider }),
  /** Grup ödemesi (misafir) */
  initiateGroupGuest: (checkoutGroupId: string, provider: 'paytr') =>
    api.post('/payments/initiate-guest', { checkoutGroupId, provider }),
  /** Takas nakit fark ödemesi başlat (sipariş/teklif ile aynı ödeme altyapısı) */
  initiateTradeCash: (tradeId: string) =>
    api.post('/payments/initiate-trade-cash', { tradeId }),
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
  /** Fail sayfasından; ödeme hâlâ pending ise rezervasyonu serbest bırakır */
  confirmFailed: (paymentId: string) =>
    api.post<{ released: boolean }>(`/payments/${paymentId}/confirm-failed`),
  /** Success sayfasından; PayTR durum-sorgu ile ödemeyi anında tamamlar */
  verify: (paymentId: string) =>
    api.post<{ completed: boolean; status: string }>(`/payments/${paymentId}/verify`),
  refund: (orderId: string, refundAmount?: number) =>
    api.post('/payments/refund', { orderId, refundAmount }),
  retry: (paymentId: string) =>
    api.post(`/payments/${paymentId}/retry`),
  /** Dev/test: PayTR olmadan ödemeyi tamamla */
  bypassComplete: (paymentId: string, _card?: string) =>
    api.post<{ success: boolean }>(`/payments/${paymentId}/bypass-complete`),
  /**
   * Direct API (TEK ödeme yolu; misafir + üye): kendi kart formumuzdan ödeme.
   * - Yeni kart: { orderId, card:{...}, saveCard } → yanıt 3DS HTML (threeDSHtml) içerir.
   * - Kayıtlı kart: { orderId, savedCardId, cvv? } → Non3D, anında status (PAYTR_RECURRING_ENABLED).
   */
  processDirect: (body: {
    orderId?: string;
    checkoutGroupId?: string;
    tradeId?: string;
    card?: {
      cardHolderName: string;
      cardNumber: string;
      expireMonth: string;
      expireYear: string;
      cvc: string;
    };
    savedCardId?: string;
    cvv?: string;
    saveCard?: boolean;
  }) =>
    api.post<{
      paymentId: string;
      orderId?: string;
      threeDSHtml: string | null;
      status: 'pending' | 'success' | 'failed' | 'wait_callback';
      reason?: string | null;
    }>('/payments/process-direct', body),
};

export type RefundReason =
  | 'changed_mind'
  | 'damaged'
  | 'wrong_item'
  | 'not_as_described'
  | 'missing_parts'
  | 'other';

export const refundsApi = {
  create: (
    orderId: string,
    body: {
      reason: RefundReason;
      description?: string;
      evidencePhotoUrls?: string[];
      refundQuantity?: number;
    },
  ) => api.post(`/orders/${orderId}/refund-requests`, body),
  myRequests: () => api.get('/refund-requests/me'),
  sellerRequests: () => api.get('/refund-requests/seller'),
  getById: (id: string) => api.get(`/refund-requests/${id}`),
  cancel: (id: string) => api.post(`/refund-requests/${id}/cancel`),
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

// Seller Bank Account (IBAN) — backend: user.controller.ts GET/PATCH/DELETE /users/me/bank-account
export const bankAccountApi = {
  get: () => api.get('/users/me/bank-account'),
  upsert: (data: {
    accountHolder: string;
    iban: string;
    tcKimlikNo?: string;
    taxId?: string;
  }) => api.patch('/users/me/bank-account', data),
  delete: () => api.delete('/users/me/bank-account'),
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
  // Public home-page spotlights
  getTopCollections: (limit = 20) =>
    api.get('/users/top-collections', { params: { limit } }),
  getFeaturedCollector: () => api.get('/users/featured-collector'),
  getFeaturedBusiness: () => api.get('/users/featured-business'),
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
export type SavedCard = {
  id: string;
  last4: string;
  brand: string | null;
  expMonth: string | null;
  expYear: string | null;
  requireCvv: boolean;
  isDefault: boolean;
  autoRenewEligible: boolean;
  createdAt: string;
};

export const membershipApi = {
  getTiers: () => api.get('/membership/tiers'),
  getCurrentMembership: () => api.get('/membership/me'),
  getLimits: () => api.get('/membership/me/limits'),
  subscribe: (data: { tierType: string; billingPeriod: 'monthly' | 'yearly' }) =>
    api.post('/membership/subscribe', data),
  cancel: () => api.post('/membership/cancel'),
  /** Bekleyen plan değişikliğini (ertelemeli downgrade / period) geri al */
  cancelScheduledChange: () => api.post('/membership/cancel-scheduled-change'),
  /** Oto-yenilemeyi aç/kapat */
  setAutoRenew: (autoRenew: boolean) =>
    api.patch('/membership/auto-renew', { autoRenew }),
  /** Kayıtlı kartları listele (maskeli; PAN/CVV içermez) */
  listCards: () => api.get<SavedCard[]>('/membership/cards'),
  /** Kayıtlı kartı sil (PayTR'dan da silinir) */
  deleteCard: (id: string) =>
    api.delete<{ deleted: boolean }>(`/membership/cards/${id}`),
};

// Notifications
export const notificationsApi = {
  getAll: (params?: Record<string, any>) => api.get('/notifications', { params }),
  markAsRead: (id: string) => api.patch(`/notifications/${id}/read`),
  markAllAsRead: () => api.post('/notifications/mark-all-read'),
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
  counter: (id: string, amount: number, message?: string) =>
    api.post(`/offers/${id}/counter`, { amount, ...(message ? { message } : {}) }),
  buyerCounter: (id: string, amount: number, message?: string) =>
    api.post(`/offers/${id}/buyer-counter`, { amount, ...(message ? { message } : {}) }),
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
      carModels?: Array<{ id: string; name: string; slug: string; brandId: string }>;
      scales?: string[];
      materials?: Array<{ slug: string; label: string }>;
      conditions?: Array<{ value: string; label: string }>;
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
  uploadReviewImage: (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return api.post<{ url: string; key?: string }>('/media/upload?folder=reviews', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
  },
  // Public asset (ürün/koleksiyon/avatar) için doğrudan görüntüleme URL'i.
  // key tam yol olmalı: {env}/{bucket}/... — bucket key'den türetilir.
  getPublicUrl: (key: string) =>
    api.get<{ url: string }>(`/media/public-url/${key}`),
  deleteFile: (key: string) => api.delete(`/media/file/${key}`),
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


