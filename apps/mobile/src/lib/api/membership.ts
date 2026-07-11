import { api } from './client';

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
  /** Kayıtlı kartları listele (maskeli; PAN/CVV içermez) — GET /membership/cards */
  listCards: () => api.get('/membership/cards'),
  /** Kayıtlı kartı sil (PayTR'dan da silinir) — DELETE /membership/cards/:id */
  deleteCard: (id: string) => api.delete(`/membership/cards/${id}`),
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
