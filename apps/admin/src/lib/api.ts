import axios from 'axios';

/**
 * Client API instance. Every call goes to the same-origin BFF proxy
 * (`/api/*` → src/app/api/[...path]/route.ts), which attaches the Bearer
 * token server-side and refreshes it on 401. The browser never holds or sees
 * the API tokens — auth lives in src/lib/server/session.ts.
 */
export const api = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' },
});

// A 401 that reaches the client means the server-side session is genuinely
// gone (refresh failed) — send the user to login.
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (
      error.response?.status === 401 &&
      typeof window !== 'undefined' &&
      window.location.pathname !== '/login'
    ) {
      window.location.href = '/login';
    }
    if (!error.response) {
      error.message = 'Sunucuya bağlanılamadı. Lütfen internet bağlantınızı kontrol edin.';
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
  cancelUserMembership: (id: string) => api.post(`/admin/users/${id}/membership/cancel`),
  changeUserMembership: (id: string, tierType: string, billingPeriod: 'monthly' | 'yearly' = 'monthly') =>
    api.patch(`/admin/users/${id}/membership`, { tierType, billingPeriod }),

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
  getRolePermissions: () => api.get<Record<string, string[]>>('/admin/staff/role-permissions'),
  setRolePermissions: (permissions: Record<string, string[]>) =>
    api.put<Record<string, string[]>>('/admin/staff/role-permissions', { permissions }),

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
  restoreProduct: (id: string) => api.post(`/admin/products/${id}/restore`),
  exportProducts: (params?: { status?: string; categoryId?: string; sellerId?: string }) =>
    api.get('/admin/products-export', { params, responseType: 'blob' }),

  // Refunds
  getRefundHistory: (params?: { search?: string; startDate?: string; endDate?: string; page?: number; limit?: number }) =>
    api.get('/admin/payments/refunds', { params }),

  // Reviews
  getReviews: (params?: any) => api.get('/admin/reviews', { params }),
  updateReviewStatus: (id: string, status: string) => api.patch(`/admin/reviews/${id}/status`, { status }),
  getUserRatings: (params?: any) => api.get('/admin/user-ratings', { params }),
  updateUserRatingStatus: (id: string, status: string) => api.patch(`/admin/user-ratings/${id}/status`, { status }),

  // Orders
  getOrders: (params?: any) => api.get('/admin/orders', { params }),
  getOrder: (id: string) => api.get(`/admin/orders/${id}`),
  updateOrderStatus: (id: string, status: string) => api.patch(`/admin/orders/${id}`, { status }),
  getOrderInvoice: (id: string) => api.get(`/admin/orders/${id}/invoice`),
  applyOrderCoupon: (id: string, code: string | null) =>
    api.post(`/admin/orders/${id}/apply-coupon`, { code }),
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
  rejectMessage: (id: string, reason?: string) => api.post(`/admin/messages/${id}/reject`, { reason }),
  revertMessage: (id: string) => api.post(`/admin/messages/${id}/revert`),

  // Support Tickets
  getTickets: (params?: any) => api.get('/support/admin/tickets', { params }),
  getTicket: (id: string) => api.get(`/support/admin/tickets/${id}`),
  updateTicketStatus: (id: string, status: string, note?: string) =>
    api.patch(`/support/admin/tickets/${id}/status`, { status, ...(note ? { note } : {}) }),
  replyToTicket: (id: string, content: string, isInternal = false) =>
    api.post(`/support/admin/tickets/${id}/messages`, { content, isInternal }),
  getGuestContacts: () => api.get('/support/admin/guest-contacts'),

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

  // Kullanıcı şikayetleri (içerik raporları)
  getUserReports: (params?: { status?: string; type?: string; page?: number; pageSize?: number }) =>
    api.get('/user-reports/admin', { params }),
  getUserReportStats: () => api.get('/user-reports/admin/stats'),
  getUserReportById: (id: string) => api.get(`/user-reports/admin/${id}`),

  // Settings
  getSettings: () => api.get('/admin/settings'),
  updateSettings: (data: any) => api.patch('/admin/settings', data),
  updateSetting: (key: string, value: string) => api.patch(`/admin/settings/${key}`, { value }),
  getCommissionRevenue: (params?: { fromDate?: string; toDate?: string }) =>
    api.get('/admin/commission/revenue', { params }),
  getCommissionRules: () => api.get('/admin/commission-rules'),
  createCommissionRule: (data: any) => api.post('/admin/commission-rules', data),
  updateCommissionRule: (id: string, data: any) => api.patch(`/admin/commission-rules/${id}`, data),
  deleteCommissionRule: (id: string) => api.delete(`/admin/commission-rules/${id}`),
  getTradeCommissionRate: () => api.get('/admin/trade-commission-rate'),
  setTradeCommissionRate: (rate: number) => api.patch('/admin/trade-commission-rate', { rate }),

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
  /** Single media upload used by all image fields (FormImageUpload). Returns { url, key }. */
  uploadMedia: (file: File) => {
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
  // Faturalar (e-Arşiv/e-Fatura) — kesilen + iade belgeleri
  getInvoices: (params?: {
    type?: string;
    status?: string;
    documentType?: string;
    search?: string;
    startDate?: string;
    endDate?: string;
    page?: number;
    limit?: number;
  }) => api.get('/admin/invoices', { params }),
  getInvoicePdf: (id: string) => api.get(`/admin/invoices/${id}/pdf`),
  // Kurumsal satıcıların elle yüklediği ürün faturaları (ayrı sekme)
  getSellerInvoices: (params?: {
    search?: string;
    startDate?: string;
    endDate?: string;
    page?: number;
    limit?: number;
  }) => api.get('/admin/seller-invoices', { params }),
  getSellerInvoicePdf: (id: string) => api.get(`/admin/seller-invoices/${id}/pdf`),
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
    search?: string;
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

  // Tax Settings — basit KDV config (eski bölge/oran/kural CRUD'u UI'dan kaldırıldı;
  // backend uçları duruyor, UI tax/vat cephesini kullanır)
  getVatConfig: () => api.get('/admin/tax/vat'),
  setDefaultVat: (rate: number) => api.patch('/admin/tax/vat', { rate }),
  setVatOverride: (categoryId: string, rate: number) =>
    api.put('/admin/tax/vat/override', { categoryId, rate }),
  deleteVatOverride: (id: string) => api.delete(`/admin/tax/vat/override/${id}`),
  getTaxReport: (params?: { fromDate?: string; toDate?: string; groupBy?: string }) =>
    api.get('/admin/tax/report', { params }),
  getWithholdingRate: () => api.get('/admin/tax/withholding'),
  setWithholdingRate: (rate: number) => api.patch('/admin/tax/withholding', { rate }),
  getWithholdingReport: (params: { year: number; month: number }) =>
    api.get('/admin/tax/withholding-report', { params }),

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
  previewEmailTemplate: (
    key: string,
    templateData?: Record<string, any>,
    draft?: { html?: string; subject?: string },
  ) =>
    api.post(`/admin/email-templates/${encodeURIComponent(key)}/preview`, {
      templateData,
      ...(draft?.html !== undefined && { overrideHtml: draft.html }),
      ...(draft?.subject !== undefined && { overrideSubject: draft.subject }),
    }),
  resetEmailTemplate: (key: string) =>
    api.delete(`/admin/email-templates/${encodeURIComponent(key)}`),
  sendTestEmail: (key: string, data: { to: string; templateData?: Record<string, any> }) =>
    api.post(`/admin/email-templates/${encodeURIComponent(key)}/send-test`, data),

  // Shipping (operations) — sipariş gönderilerini görüntüleme/takip (salt-okunur).
  // Konfig (methods/carriers/zones/rates) ve etiket üretimi kaldırıldı; gerçek kargo Sürat entegrasyonu.
  getShipments(params?: any) {
    return api.get('/admin/shipping/shipments', { params });
  },
  // Bir Sürat kargosunun takip durumunu 30 dk cron'u beklemeden anında senkronlar.
  syncShipmentTracking(id: string) {
    return api.post(`/admin/shipping/shipments/${id}/sync-tracking`);
  },
  // Sürat REST endpoint testi: gönderi oluştur + takibini sorgula (ham cevapları döner).
  suratEndpointTest() {
    return api.post('/admin/shipping/surat/endpoint-test');
  },
  // Test konsolu: referansla Sürat takip sorgusu (KargoTakipHareketDetayi).
  suratTestTrack(ref: string) {
    return api.post('/admin/shipping/surat/track', { ref });
  },
  // Test konsolu: referansla Sürat iptal/geri-çek (GonderiGeriCek).
  suratTestCancel(ref: string) {
    return api.post('/admin/shipping/surat/cancel', { ref });
  },

  // Notifications
  getNotificationHistory: (params?: {
    page?: number;
    limit?: number;
    channel?: string;
    status?: string;
    userId?: string;
    type?: string;
    search?: string;
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

  // Seller Applications
  getSellerApplications: (params?: { page?: number; limit?: number; search?: string; status?: string }) =>
    api.get('/admin/seller-applications', { params }),
  approveSellerApplication: (id: string) =>
    api.post(`/admin/seller-applications/${id}/approve`),
  rejectSellerApplication: (id: string, reason: string) =>
    api.post(`/admin/seller-applications/${id}/reject`, { reason }),
};


export default api;

