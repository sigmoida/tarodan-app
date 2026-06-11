import axios from 'axios';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export const api = axios.create({
  baseURL: `${API_URL}/api`,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor to add auth token
api.interceptors.request.use(
  (config) => {
    if (typeof window !== 'undefined') {
      const token = localStorage.getItem('admin_token');
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      } else if (process.env.NODE_ENV === 'development') {
        console.warn('No admin token found in localStorage');
      }
    }

    // Log request in development
    if (process.env.NODE_ENV === 'development') {
      console.log('API Request:', {
        method: config.method?.toUpperCase(),
        url: config.url,
        baseURL: config.baseURL,
        fullURL: `${config.baseURL}${config.url}`,
        hasAuth: !!config.headers.Authorization,
      });
    }

    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Oturumu sonlandır (refresh de başarısızsa).
function forceLogout() {
  if (typeof window === 'undefined') return;
  localStorage.removeItem('admin_token');
  localStorage.removeItem('admin_refresh_token');
  localStorage.removeItem('admin_user');
  // Middleware admin erişimini admin_token COOKIE'sine göre açıyor; cookie
  // temizlenmezse ölü oturum "girişli" görünüp sonsuz 401'e sokuyor.
  document.cookie = 'admin_token=; path=/; max-age=0; SameSite=Lax';
  window.location.href = '/login';
}

// Eşzamanlı 401'lerde tek refresh yapmak için kuyruk.
let isRefreshing = false;
let refreshQueue: Array<(token: string | null) => void> = [];
const flushQueue = (token: string | null) => {
  refreshQueue.forEach((cb) => cb(token));
  refreshQueue = [];
};

function persistAccessToken(token: string) {
  localStorage.setItem('admin_token', token);
  const maxAge = 24 * 60 * 60;
  document.cookie = `admin_token=${token}; path=/; max-age=${maxAge}; SameSite=Lax`;
}

const isAuthUrl = (url: string) =>
  url.includes('/auth/admin/login') ||
  url.includes('/auth/login') ||
  url.includes('/auth/refresh') ||
  url.includes('/auth/forgot-password') ||
  url.includes('/auth/reset-password');

// Response interceptor: 401'de refresh token'la sessizce yenile, sonra isteği tekrarla.
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (process.env.NODE_ENV === 'development') {
      console.error('API Error:', {
        url: error.config?.url,
        method: error.config?.method,
        status: error.response?.status,
        message: error.message,
        response: error.response?.data,
      });
    }

    const originalRequest = error.config || {};
    const status = error.response?.status;
    const reqUrl: string = originalRequest.url || '';

    if (
      status === 401 &&
      typeof window !== 'undefined' &&
      !isAuthUrl(reqUrl) &&
      !originalRequest._retry
    ) {
      const refreshToken = localStorage.getItem('admin_refresh_token');
      if (!refreshToken) {
        forceLogout();
        return Promise.reject(error);
      }
      originalRequest._retry = true;

      // Zaten bir refresh sürüyorsa kuyruğa gir, bitince tekrarla.
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          refreshQueue.push((token) => {
            if (token) {
              originalRequest.headers = originalRequest.headers || {};
              originalRequest.headers.Authorization = `Bearer ${token}`;
              resolve(api(originalRequest));
            } else {
              reject(error);
            }
          });
        });
      }

      isRefreshing = true;
      try {
        // Interceptor'sız ham axios ile yenile (sonsuz döngü olmasın, eski token gitmesin).
        const resp = await axios.post(`${API_URL}/api/auth/refresh`, {
          refreshToken,
        });
        const newAccess: string | undefined =
          resp.data?.accessToken ?? resp.data?.tokens?.accessToken;
        const newRefresh: string | undefined =
          resp.data?.refreshToken ?? resp.data?.tokens?.refreshToken;
        if (!newAccess) throw new Error('Yenileme yanıtında token yok');

        persistAccessToken(newAccess);
        if (newRefresh) localStorage.setItem('admin_refresh_token', newRefresh);
        flushQueue(newAccess);

        originalRequest.headers = originalRequest.headers || {};
        originalRequest.headers.Authorization = `Bearer ${newAccess}`;
        return api(originalRequest);
      } catch (refreshErr) {
        flushQueue(null);
        forceLogout();
        return Promise.reject(refreshErr);
      } finally {
        isRefreshing = false;
      }
    }

    if (!error.response) {
      error.message =
        'Sunucuya bağlanılamadı. Lütfen internet bağlantınızı kontrol edin.';
    }

    return Promise.reject(error);
  },
);

// API endpoints (api is the axios instance; use api.get/post etc. for custom paths)
export const adminApi = {
  get: (url: string, config?: any) => api.get(url, config),
  post: (url: string, data?: any, config?: any) => api.post(url, data, config),
  patch: (url: string, data?: any, config?: any) => api.patch(url, data, config),
  delete: (url: string, config?: any) => api.delete(url, config),

  // Dashboard
  getDashboard: () => api.get('/admin/dashboard'),
  getRecentOrders: (limit?: number) => api.get('/admin/dashboard/recent-orders', { params: { limit } }),
  getPendingActions: () => api.get('/admin/dashboard/pending-actions'),
  getIdentityVerificationRequests: () => api.get('/admin/users/verification-requests'),

  // Analytics
  getSalesAnalytics: (params?: { startDate?: string; endDate?: string; groupBy?: string }) =>
    api.get('/admin/analytics/sales', { params }),
  getRevenueAnalytics: (params?: { startDate?: string; endDate?: string; groupBy?: string }) =>
    api.get('/admin/analytics/revenue', { params }),
  getUserAnalytics: (params?: { startDate?: string; endDate?: string; groupBy?: string }) =>
    api.get('/admin/analytics/users', { params }),

  // Users
  getUsers: (params?: any) => api.get('/admin/users', { params }),
  getUser: (id: string) => api.get(`/admin/users/${id}`),
  updateUser: (id: string, data: any) => api.patch(`/admin/users/${id}`, data),
  banUser: (id: string, reason: string) => api.post(`/admin/users/${id}/ban`, { reason }),
  unbanUser: (id: string) => api.post(`/admin/users/${id}/unban`),

  // Admin Staff (roller & atamalar)
  getStaff: () => api.get('/admin/staff'),
  assignStaff: (data: { email: string; role: string; password?: string; displayName?: string }) =>
    api.post('/admin/staff', data),
  updateStaff: (id: string, data: { role?: string; isActive?: boolean }) =>
    api.patch(`/admin/staff/${id}`, data),
  removeStaff: (id: string) => api.delete(`/admin/staff/${id}`),
  getStaffSettings: () => api.get('/admin/staff/settings'),
  setStaffSettings: (allowAdminAssign: boolean) =>
    api.patch('/admin/staff/settings', { allowAdminAssign }),

  // Products
  getProducts: (params?: any) => api.get('/admin/products', { params }),
  getProduct: (id: string) => api.get(`/admin/products/${id}`),
  updateProduct: (id: string, data: any) => api.patch(`/admin/products/${id}`, data),
  approveProduct: (id: string, note?: string) => {
    const body = note ? { note } : {};
    return api.post(`/admin/products/${id}/approve`, body);
  },
  rejectProduct: (id: string, reason: string) => api.post(`/admin/products/${id}/reject`, { reason }),
  bulkApproveProducts: (ids: string[], note?: string) => api.post('/admin/products/bulk-approve', { ids, note }),
  bulkRejectProducts: (ids: string[], reason: string) => api.post('/admin/products/bulk-reject', { ids, reason }),
  deleteProduct: (id: string) => api.delete(`/admin/products/${id}`),
  exportProducts: (params?: { status?: string; categoryId?: string; sellerId?: string }) =>
    api.get('/admin/products-export', { params, responseType: 'blob' }),

  // Refunds
  getRefundHistory: (params?: { search?: string; startDate?: string; endDate?: string; page?: number; limit?: number }) =>
    api.get('/admin/payments/refunds', { params }),

  // Reviews
  getReviews: (params?: any) => api.get('/admin/reviews', { params }),
  updateReviewStatus: (id: string, status: string) => api.patch(`/admin/reviews/${id}/status`, { status }),
  replyToReview: (id: string, reply: string) => api.post(`/admin/reviews/${id}/reply`, { reply }),
  deleteReview: (id: string) => api.delete(`/admin/reviews/${id}`),
  getUserRatings: (params?: any) => api.get('/admin/user-ratings', { params }),
  updateUserRatingStatus: (id: string, status: string) => api.patch(`/admin/user-ratings/${id}/status`, { status }),
  deleteUserRating: (id: string) => api.delete(`/admin/user-ratings/${id}`),

  // Orders
  getOrders: (params?: any) => api.get('/admin/orders', { params }),
  getOrder: (id: string) => api.get(`/admin/orders/${id}`),
  updateOrderStatus: (id: string, status: string) => api.patch(`/admin/orders/${id}`, { status }),
  addOrderTracking: (id: string, trackingNumber: string, carrier: string, trackingUrl?: string) =>
    api.post(`/admin/orders/${id}/tracking`, { trackingNumber, carrier, trackingUrl }),
  sendOrderNotification: (id: string, type: string, message?: string) =>
    api.post(`/admin/orders/${id}/notify`, { type, message }),
  getOrderInvoice: (id: string) => api.get(`/admin/orders/${id}/invoice`),
  // 48h pencere (Faz 4A.1)
  forceCompleteOrder: (id: string, reason?: string) =>
    api.post(`/admin/orders/${id}/force-complete`, reason ? { reason } : {}),
  extendOrderConfirmation: (
    id: string,
    payload: { hours: number; reason?: string },
  ) => api.post(`/admin/orders/${id}/extend-confirmation`, payload),

  // RefundRequest policy override (Faz 4B.1)
  overrideRefundPolicy: (
    id: string,
    payload: {
      refundProductAmount?: boolean;
      refundShippingFee?: boolean;
      refundBuyerFee?: boolean;
      refundSellerCommission?: boolean;
    },
  ) => api.patch(`/admin/refund-requests/${id}/override-policy`, payload),

  setReturnShippingPayer: (
    id: string,
    payer: 'buyer' | 'seller' | 'platform',
  ) => api.patch(`/admin/refund-requests/${id}/set-shipping-payer`, { payer }),

  // Trades
  getTrades: (params?: any) => api.get('/admin/trades', { params }),
  getTrade: (id: string) => api.get(`/admin/trades/${id}`),
  resolveTrade: (id: string, resolution: any) => api.post(`/admin/trades/${id}/resolve`, resolution),
  // Safe-trade (escrow) admin actions
  markWarehouseReceived: (tradeId: string, shipmentId: string) =>
    api.post(`/admin/trades/${tradeId}/mark-warehouse-received`, { shipmentId }),
  approveTrade: (tradeId: string, notes?: string) =>
    api.post(`/admin/trades/${tradeId}/approve`, notes ? { notes } : {}),
  rejectTrade: (tradeId: string, reason: string) =>
    api.post(`/admin/trades/${tradeId}/reject`, { reason }),
  markReturnDelivered: (tradeId: string, shipmentId: string) =>
    api.post(`/admin/trades/${tradeId}/mark-return-delivered`, { shipmentId }),
  retryTradeRefund: (tradeId: string) =>
    api.post(`/admin/trades/${tradeId}/retry-refund`),
  resolveTradeCompensation: (tradeId: string, note?: string) =>
    api.post(`/admin/trades/${tradeId}/resolve-compensation`, note ? { note } : {}),

  // RefundRequest admin
  getRefundRequests: (params?: any) =>
    api.get('/admin/refund-requests', { params }),
  getRefundRequest: (id: string) => api.get(`/admin/refund-requests/${id}`),
  resolveRefundDispute: (
    id: string,
    body: { resolution: 'approve' | 'reject'; notes: string },
  ) => api.post(`/admin/refund-requests/${id}/resolve-dispute`, body),
  forceFinalizeRefund: (id: string) =>
    api.post(`/admin/refund-requests/${id}/force-finalize`),
  markTradeReturnLost: (
    tradeId: string,
    body: { shipmentId: string; reason: string; compensateUserId?: string },
  ) => api.post(`/admin/trades/${tradeId}/mark-return-lost`, body),
  forceCancelStuckTrade: (
    tradeId: string,
    body: { reason: string; sendArrivedItemBack: boolean },
  ) => api.post(`/admin/trades/${tradeId}/force-cancel-stuck`, body),
  resolveTradeDispute: (
    tradeId: string,
    resolution: string,
    notes: string,
  ) => api.post(`/trades/${tradeId}/resolve-dispute`, { resolution, notes }),

  // Trade shipments (cross-trade listing)
  getTradeShipments: (params?: any) => api.get('/admin/trade-shipments', { params }),

  // Messages
  getMessages: (params?: any) => api.get('/admin/messages', { params }),
  getMessage: (id: string) => api.get(`/admin/messages/${id}`),
  approveMessage: (id: string, notes?: string) => api.post(`/admin/messages/${id}/approve`, notes ? { notes } : {}),
  rejectMessage: (id: string, reason: string) => api.post(`/admin/messages/${id}/reject`, { reason }),

  // Support Tickets
  getTickets: (params?: any) => api.get('/admin/support-tickets', { params }),
  getTicket: (id: string) => api.get(`/admin/support-tickets/${id}`),
  updateTicket: (id: string, data: any) => api.patch(`/admin/support-tickets/${id}`, data),
  replyToTicket: (id: string, message: string) => api.post(`/admin/support-tickets/${id}/reply`, { message }),

  // Reports
  getSalesReport: (params?: { startDate?: string; endDate?: string; format?: string }) =>
    api.get('/admin/reports/sales', { params }),
  getCommissionReport: (params?: { startDate?: string; endDate?: string }) =>
    api.get('/admin/reports/commission', { params }),
  getUserReport: (params?: any) => api.get('/admin/reports/users', { params }),
  getTradeReport: (params?: any) => api.get('/admin/reports/trades', { params }),
  getProductReport: (params?: any) => api.get('/admin/reports/products', { params }),
  exportReport: (type: string, format: string, params?: any) =>
    api.get(`/admin/reports/${type}`, { params: { ...params, format }, responseType: 'json' }),

  // Settings
  getSettings: () => api.get('/admin/settings'),
  updateSettings: (data: any) => api.patch('/admin/settings', data),
  updateSetting: (key: string, value: string) => api.patch(`/admin/settings/${key}`, { value }),
  getCommissionRules: () => api.get('/admin/commission-rules'),
  createCommissionRule: (data: any) => api.post('/admin/commission-rules', data),
  updateCommissionRule: (id: string, data: any) => api.patch(`/admin/commission-rules/${id}`, data),
  deleteCommissionRule: (id: string) => api.delete(`/admin/commission-rules/${id}`),

  // Membership Tiers
  getMembershipTiers: () => api.get('/admin/membership-tiers'),
  updateMembershipTier: (id: string, data: any) => api.patch(`/admin/membership-tiers/${id}`, data),

  // Categories
  getCategories: () => api.get('/admin/categories'),
  createCategory: (data: any) => api.post('/admin/categories', data),
  updateCategory: (id: string, data: any) => api.patch(`/admin/categories/${id}`, data),

  deleteCategory: (id: string) => api.delete(`/admin/categories/${id}`),

  // Brands
  getBrands: () => api.get('/admin/brands'),
  createBrand: (data: any) => api.post('/admin/brands', data),
  updateBrand: (id: string, data: any) => api.patch(`/admin/brands/${id}`, data),
  deleteBrand: (id: string) => api.delete(`/admin/brands/${id}`),

  getManufacturers: () => api.get('/admin/manufacturers'),
  createManufacturer: (data: any) => api.post('/admin/manufacturers', data),
  updateManufacturer: (id: string, data: any) => api.patch(`/admin/manufacturers/${id}`, data),
  deleteManufacturer: (id: string) => api.delete(`/admin/manufacturers/${id}`),
  uploadManufacturerLogo: (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return api.post<{ url: string; key: string }>('/admin/media/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },

  getCarModels: (brandId?: string) => api.get('/admin/car-models', { params: brandId ? { brandId } : {} }),
  createCarModel: (data: any) => api.post('/admin/car-models', data),
  updateCarModel: (id: string, data: any) => api.patch(`/admin/car-models/${id}`, data),
  deleteCarModel: (id: string) => api.delete(`/admin/car-models/${id}`),

  // Advertisements
  getAds: () => api.get('/admin/ads'),
  createAd: (data: any) => api.post('/admin/ads', data),
  updateAd: (id: string, data: any) => api.patch(`/admin/ads/${id}`, data),
  deleteAd: (id: string) => api.delete(`/admin/ads/${id}`),
  reorderAds: (ids: string[]) => api.patch('/admin/ads/reorder', { ids }),
  uploadAdImage: (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return api.post<{ url: string }>('/admin/media/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },

  // Audit Logs
  getAuditLogs: (params?: any) => api.get('/admin/audit-logs', { params }),

  // Payments
  getPayments: (params?: {
    status?: string;
    provider?: string;
    startDate?: string;
    endDate?: string;
    search?: string;
    page?: number;
    limit?: number;
  }) => api.get('/admin/payments', { params }),
  getPayment: (id: string) => api.get(`/admin/payments/${id}`),
  getPaymentStatistics: (params?: {
    period?: 'daily' | 'weekly' | 'monthly';
    startDate?: string;
    endDate?: string;
  }) => api.get('/admin/payments/statistics', { params }),
  getFailedPayments: (params?: {
    provider?: string;
    startDate?: string;
    endDate?: string;
    search?: string;
    page?: number;
    limit?: number;
  }) => api.get('/admin/payments/failed', { params }),
  manualRefund: (id: string, data: { amount?: number; reason?: string }) =>
    api.post(`/admin/payments/${id}/manual-refund`, data),
  forceCancelPayment: (id: string, reason: string) =>
    api.post(`/admin/payments/${id}/force-cancel`, { reason }),

  // Seller Payouts
  getPayoutsSummary: () => api.get('/admin/payouts/summary'),
  getPayoutsTransactions: (params?: {
    sellerId?: string;
    status?: string;
    dateFrom?: string;
    dateTo?: string;
    page?: number;
    limit?: number;
  }) => api.get('/admin/payouts/transactions', { params }),
  getPayoutsSchedule: (params?: { sellerId?: string; limit?: number }) =>
    api.get('/admin/payouts/schedule', { params }),
  getPayoutsExport: (params?: {
    sellerId?: string;
    status?: string;
    dateFrom?: string;
    dateTo?: string;
  }) => api.get('/admin/payouts/export', { params }),
  releasePayout: (orderId: string) => api.post(`/admin/payouts/release/${orderId}`),

  // Tax Settings
  getTaxRegions: () => api.get('/admin/tax/regions'),
  createTaxRegion: (data: any) => api.post('/admin/tax/regions', data),
  updateTaxRegion: (id: string, data: any) => api.patch(`/admin/tax/regions/${id}`, data),
  deleteTaxRegion: (id: string) => api.delete(`/admin/tax/regions/${id}`),
  getTaxRates: (regionId?: string) =>
    api.get('/admin/tax/rates', regionId ? { params: { regionId } } : {}),
  createTaxRate: (data: any) => api.post('/admin/tax/rates', data),
  updateTaxRate: (id: string, data: any) => api.patch(`/admin/tax/rates/${id}`, data),
  deleteTaxRate: (id: string) => api.delete(`/admin/tax/rates/${id}`),
  getTaxRules: (regionId?: string) =>
    api.get('/admin/tax/rules', regionId ? { params: { regionId } } : {}),
  createTaxRule: (data: any) => api.post('/admin/tax/rules', data),
  updateTaxRule: (id: string, data: any) => api.patch(`/admin/tax/rules/${id}`, data),
  deleteTaxRule: (id: string) => api.delete(`/admin/tax/rules/${id}`),
  getTaxReport: (params?: { fromDate?: string; toDate?: string; groupBy?: string }) =>
    api.get('/admin/tax/report', { params }),

  // Static Pages
  getPages: () => api.get('/admin/pages'),
  getPageById: (id: string) => api.get(`/admin/pages/${id}`),
  getPageBySlug: (slug: string) => api.get(`/admin/pages/slug/${slug}`),
  createPage: (data: any) => api.post('/admin/pages', data),
  updatePage: (id: string, data: any) => api.patch(`/admin/pages/${id}`, data),
  deletePage: (id: string) => api.delete(`/admin/pages/${id}`),

  // Email Templates
  getEmailTemplates: () => api.get('/admin/email-templates'),
  getEmailTemplate: (key: string) => api.get(`/admin/email-templates/${encodeURIComponent(key)}`),
  updateEmailTemplate: (key: string, data: any) =>
    api.patch(`/admin/email-templates/${encodeURIComponent(key)}`, data),
  previewEmailTemplate: (key: string, templateData?: Record<string, any>) =>
    api.post(`/admin/email-templates/${encodeURIComponent(key)}/preview`, { templateData }),
  sendTestEmail: (key: string, data: { to: string; templateData?: Record<string, any> }) =>
    api.post(`/admin/email-templates/${encodeURIComponent(key)}/send-test`, data),

  // Shipping Methods
  getShippingMethods: (params?: { isActive?: boolean; search?: string }) =>
    api.get('/admin/shipping/methods', { params }),
  createShippingMethod: (data: { name: string; code: string; description?: string; isActive?: boolean; sortOrder?: number }) =>
    api.post('/admin/shipping/methods', data),
  updateShippingMethod: (id: string, data: any) =>
    api.patch(`/admin/shipping/methods/${id}`, data),
  deleteShippingMethod: (id: string) =>
    api.delete(`/admin/shipping/methods/${id}`),

  // Shipping Carriers
  getShippingCarriers: (params?: { isActive?: boolean; supportsLabels?: boolean; search?: string }) =>
    api.get('/admin/shipping/carriers', { params }),
  createShippingCarrier: (data: {
    name: string;
    code: string;
    logo?: string;
    trackingUrl?: string;
    apiEndpoint?: string;
    apiKey?: string;
    apiSecret?: string;
    isActive?: boolean;
    supportsLabels?: boolean;
  }) => api.post('/admin/shipping/carriers', data),
  updateShippingCarrier: (id: string, data: any) =>
    api.patch(`/admin/shipping/carriers/${id}`, data),
  deleteShippingCarrier: (id: string) =>
    api.delete(`/admin/shipping/carriers/${id}`),

  // Shipping Zones
  getShippingZones: (params?: { isActive?: boolean; country?: string; search?: string }) =>
    api.get('/admin/shipping/zones', { params }),
  createShippingZone: (data: {
    name: string;
    description?: string;
    countries?: string[];
    regions?: string[];
    cities?: string[];
    isDefault?: boolean;
    isActive?: boolean;
  }) => api.post('/admin/shipping/zones', data),
  updateShippingZone: (id: string, data: any) =>
    api.patch(`/admin/shipping/zones/${id}`, data),
  deleteShippingZone: (id: string) =>
    api.delete(`/admin/shipping/zones/${id}`),

  // Shipping Rates
  getShippingRates: (params?: { zoneId?: string; methodId?: string; carrierId?: string; isActive?: boolean }) =>
    api.get('/admin/shipping/rates', { params }),
  createShippingRate: (data: {
    zoneId: string;
    methodId: string;
    carrierId: string;
    basePrice: number;
    pricePerKg?: number;
    freeShippingMin?: number;
    minDeliveryDays: number;
    maxDeliveryDays: number;
    isActive?: boolean;
  }) => api.post('/admin/shipping/rates', data),
  updateShippingRate: (id: string, data: any) =>
    api.patch(`/admin/shipping/rates/${id}`, data),
  deleteShippingRate: (id: string) =>
    api.delete(`/admin/shipping/rates/${id}`),

  // Shipping Labels
  getShipments(params?: any) {
    return api.get('/admin/shipping/shipments', { params });
  },
  generateShippingLabel: (shipmentId: string) =>
    api.post('/admin/shipping/labels/generate', { shipmentId }),
  bulkGenerateShippingLabels: (shipmentIds: string[]) =>
    api.post('/admin/shipping/labels/bulk-generate', { shipmentIds }),

  // Notifications
  getNotificationHistory: (params?: {
    page?: number;
    limit?: number;
    channel?: string;
    status?: string;
    userId?: string;
    type?: string;
    startDate?: string;
    endDate?: string;
  }) => api.get('/admin/notifications/history', { params }),
  sendNotification: (data: {
    title: string;
    body: string;
    channels: string[];
    targetType: 'all' | 'segment' | 'user_ids';
    userIds?: string[];
    segmentCriteria?: Record<string, any>;
    data?: Record<string, any>;
  }) => api.post('/admin/notifications/send', data),
  scheduleNotification: (data: {
    title: string;
    body: string;
    channels: string[];
    targetType: 'all' | 'segment' | 'user_ids';
    userIds?: string[];
    segmentCriteria?: Record<string, any>;
    scheduledFor: string;
  }) => api.post('/admin/notifications/schedule', data),
  getScheduledNotifications: (params?: { page?: number; limit?: number; status?: string }) =>
    api.get('/admin/notifications/scheduled', { params }),
  cancelScheduledNotification: (id: string) =>
    api.delete(`/admin/notifications/scheduled/${id}`),

  // Logs
  getErrorLogs: (params?: any) => api.get('/admin/logs/errors', { params }),
  getSecurityLogs: (params?: any) => api.get('/admin/logs/security', { params }),
  getEmailLogs: (params?: any) => api.get('/admin/logs/emails', { params }),
  resolveSecurityIssue: (id: string, notes?: string) => api.patch(`/admin/logs/security/${id}/resolve`, { notes }),
  blockIP: (data: { ipAddress: string; reason?: string }) => api.post('/admin/logs/security/block-ip', data),

  // Collections
  getCollections: (params?: {
    search?: string;
    userId?: string;
    isPublic?: boolean;
    isFeatured?: boolean;
    page?: number;
    limit?: number;
    sortBy?: string;
    sortOrder?: string;
  }) => api.get('/admin/collections', { params }),
  getCollection: (id: string) => api.get(`/admin/collections/${id}`),
  createCollection: (data: {
    name: string;
    description?: string;
    isPublic?: boolean;
    isFeatured?: boolean;
    coverImageUrl?: string;
    userId?: string;
  }) => api.post('/admin/collections', data),
  updateCollection: (id: string, data: {
    name?: string;
    description?: string;
    isPublic?: boolean;
    isFeatured?: boolean;
    coverImageUrl?: string;
  }) => api.patch(`/admin/collections/${id}`, data),
  deleteCollection: (id: string) => api.delete(`/admin/collections/${id}`),
  addItemsToCollection: (id: string, productIds: string[]) =>
    api.post(`/admin/collections/${id}/items`, { productIds }),
  removeItemFromCollection: (collectionId: string, itemId: string) =>
    api.delete(`/admin/collections/${collectionId}/items/${itemId}`),
  setCollectionVisibility: (id: string, isPublic: boolean) =>
    api.patch(`/admin/collections/${id}/visibility`, { isPublic }),
  setCollectionFeatured: (id: string, isFeatured: boolean) =>
    api.patch(`/admin/collections/${id}/featured`, { isFeatured }),

  // Tags
  getTags: (params?: {
    search?: string;
    isActive?: boolean;
    page?: number;
    limit?: number;
    sortBy?: string;
    sortOrder?: string;
  }) => api.get('/admin/tags', { params }),
  createTag: (data: {
    name: string;
    description?: string;
    color?: string;
    isActive?: boolean;
  }) => api.post('/admin/tags', data),
  updateTag: (id: string, data: {
    name?: string;
    description?: string;
    color?: string;
    isActive?: boolean;
  }) => api.patch(`/admin/tags/${id}`, data),
  deleteTag: (id: string) => api.delete(`/admin/tags/${id}`),
  mergeTags: (sourceTagIds: string[], targetTagId: string) =>
    api.post('/admin/tags/merge', { sourceTagIds, targetTagId }),
  bulkAssignTags: (productIds: string[], tagIds: string[]) =>
    api.post('/admin/tags/bulk-assign', { productIds, tagIds }),
  bulkRemoveTags: (productIds: string[], tagIds: string[]) =>
    api.post('/admin/tags/bulk-remove', { productIds, tagIds }),

  // Attribute Groups
  getAttributeGroups: (params?: {
    search?: string;
    isActive?: boolean;
    page?: number;
    limit?: number;
  }) => api.get('/admin/attribute-groups', { params }),
  getAttributeGroup: (id: string) => api.get(`/admin/attribute-groups/${id}`),
  createAttributeGroup: (data: {
    name: string;
    description?: string;
    isRequired?: boolean;
    isActive?: boolean;
    sortOrder?: number;
  }) => api.post('/admin/attribute-groups', data),
  updateAttributeGroup: (id: string, data: {
    name?: string;
    description?: string;
    isRequired?: boolean;
    isActive?: boolean;
    sortOrder?: number;
  }) => api.patch(`/admin/attribute-groups/${id}`, data),
  deleteAttributeGroup: (id: string) => api.delete(`/admin/attribute-groups/${id}`),

  // Attributes
  getAttributes: (params?: {
    groupId?: string;
    search?: string;
    isActive?: boolean;
    page?: number;
    limit?: number;
  }) => api.get('/admin/attributes', { params }),
  createAttribute: (data: {
    groupId: string;
    value: string;
    displayValue?: string;
    color?: string;
    sortOrder?: number;
    isActive?: boolean;
  }) => api.post('/admin/attributes', data),
  updateAttribute: (id: string, data: {
    value?: string;
    displayValue?: string;
    color?: string;
    sortOrder?: number;
    isActive?: boolean;
  }) => api.patch(`/admin/attributes/${id}`, data),
  deleteAttribute: (id: string) => api.delete(`/admin/attributes/${id}`),
};


export default api;

